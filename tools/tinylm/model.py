"""Darsi Tiny in PyTorch: the reference for src/tinylm/model.ts (same architecture, same numbers).

Decoder-only transformer: tied token embedding / output head, pre-norm blocks (RMSNorm → causal attention with rotary
positions on interleaved pairs → residual; RMSNorm → GELU (tanh) MLP → residual), final RMSNorm, no biases.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.utils.checkpoint


@dataclass
class Config:
    vocab: int = 3000
    dim: int = 192
    layers: int = 6
    heads: int = 6
    ffn: int = 640
    ctx: int = 384
    ropeBase: float = 10000.0
    eps: float = 1e-5

    def to_dict(self):
        return asdict(self)


def rope_tables(cfg: Config, device=None):
    """cos/sin [ctx, headDim/2] in float64, then float32: the same values model.ts computes with Math.cos/sin."""
    hd = cfg.dim // cfg.heads
    i = torch.arange(hd // 2, dtype=torch.float64)
    inv = cfg.ropeBase ** (-2 * i / hd)
    ang = torch.arange(cfg.ctx, dtype=torch.float64)[:, None] * inv[None, :]
    return ang.cos().float().to(device), ang.sin().float().to(device)


def rope(x, cos, sin):
    """x: [B, T, H, hd]; rotates the pairs (x[2i], x[2i+1]) by position."""
    T = x.shape[1]
    x2 = x.view(*x.shape[:-1], -1, 2)
    a, b = x2[..., 0], x2[..., 1]
    c, s = cos[None, :T, None, :], sin[None, :T, None, :]
    return torch.stack([a * c - b * s, a * s + b * c], dim=-1).flatten(-2)


def rmsnorm(x, g, eps):
    return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + eps) * g


class Block(nn.Module):
    def __init__(self, cfg: Config):
        super().__init__()
        self.cfg = cfg
        d = cfg.dim
        self.attn_norm = nn.Parameter(torch.ones(d))
        self.wqkv = nn.Linear(d, 3 * d, bias=False)
        self.wo = nn.Linear(d, d, bias=False)
        self.ffn_norm = nn.Parameter(torch.ones(d))
        self.w1 = nn.Linear(d, cfg.ffn, bias=False)
        self.w2 = nn.Linear(cfg.ffn, d, bias=False)

    def forward(self, x, cos, sin):
        cfg = self.cfg
        B, T, d = x.shape
        H, hd = cfg.heads, d // cfg.heads
        h = rmsnorm(x, self.attn_norm, cfg.eps)
        q, k, v = self.wqkv(h).split(d, dim=-1)
        q = rope(q.view(B, T, H, hd), cos, sin).transpose(1, 2)
        k = rope(k.view(B, T, H, hd), cos, sin).transpose(1, 2)
        v = v.view(B, T, H, hd).transpose(1, 2)
        a = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        x = x + self.wo(a.transpose(1, 2).reshape(B, T, d))
        h = rmsnorm(x, self.ffn_norm, cfg.eps)
        return x + self.w2(F.gelu(self.w1(h), approximate="tanh"))


class TinyLM(nn.Module):
    def __init__(self, cfg: Config):
        super().__init__()
        self.cfg = cfg
        self.tok = nn.Embedding(cfg.vocab, cfg.dim)
        self.blocks = nn.ModuleList(Block(cfg) for _ in range(cfg.layers))
        self.norm = nn.Parameter(torch.ones(cfg.dim))
        cos, sin = rope_tables(cfg)
        self.register_buffer("cos", cos, persistent=False)
        self.register_buffer("sin", sin, persistent=False)
        for n, p in self.named_parameters():
            if p.dim() == 2:
                std = 0.02 / math.sqrt(2 * cfg.layers) if n.endswith(("wo.weight", "w2.weight")) else 0.02
                nn.init.normal_(p, 0, std)

    def forward(self, ids, upto: int | None = None, hidden: torch.Tensor | None = None):
        """ids [B, T] → logits [B, T, vocab]. `hidden` replaces the embedding and the first `upto` blocks (fine-tuning
        the top blocks on cached activations); `upto` alone returns the hidden state after that many blocks."""
        x = self.tok(ids) if hidden is None else hidden
        start = 0 if hidden is None else upto
        stop = len(self.blocks) if hidden is not None or upto is None else upto
        for b in self.blocks[start:stop]:
            x = b(x, self.cos, self.sin)
        if hidden is None and upto is not None:
            return x
        x = rmsnorm(x, self.norm, self.cfg.eps)
        return x @ self.tok.weight.T

    checkpoint = False

    def features(self, ids):
        """The final normalized hidden states [B, T, dim]; the logits are features @ tok.weight.T."""
        x = self.tok(ids)
        for b in self.blocks:
            if self.checkpoint and self.training:
                x = torch.utils.checkpoint.checkpoint(b, x, self.cos, self.sin, use_reentrant=False)
            else:
                x = b(x, self.cos, self.sin)
        return rmsnorm(x, self.norm, self.cfg.eps)

    def params(self):
        return sum(p.numel() for p in self.parameters())


# ---- int8 ------------------------------------------------------------------------------------------------------------

def quantize_rows(w: torch.Tensor):
    """Symmetric int8 per row: w ≈ q * scale[row]. model.ts dequantizes the same way."""
    w = w.detach().float().cpu()
    amax = w.abs().amax(dim=1)
    scale = torch.where(amax > 0, amax / 127.0, torch.ones_like(amax))
    q = torch.clamp(torch.round(w / scale[:, None]), -127, 127).to(torch.int8)
    return q, scale.float()


def int8_state(model: TinyLM):
    """Every matrix quantized; norms stay float32. Names match model.bin."""
    out = {"tok": quantize_rows(model.tok.weight), "norm": model.norm.detach().float().cpu()}
    for i, b in enumerate(model.blocks):
        out[f"l{i}.attn_norm"] = b.attn_norm.detach().float().cpu()
        out[f"l{i}.wqkv"] = quantize_rows(b.wqkv.weight)
        out[f"l{i}.wo"] = quantize_rows(b.wo.weight)
        out[f"l{i}.ffn_norm"] = b.ffn_norm.detach().float().cpu()
        out[f"l{i}.w1"] = quantize_rows(b.w1.weight)
        out[f"l{i}.w2"] = quantize_rows(b.w2.weight)
    return out


def load_int8(cfg: Config, state: dict) -> TinyLM:
    """A float32 model whose weights are exactly the dequantized int8 ones: what the phone runs."""
    m = TinyLM(cfg)
    deq = lambda t: t[0].float() * t[1][:, None]  # noqa: E731
    with torch.no_grad():
        m.tok.weight.copy_(deq(state["tok"]))
        m.norm.copy_(state["norm"])
        for i, b in enumerate(m.blocks):
            b.attn_norm.copy_(state[f"l{i}.attn_norm"])
            b.wqkv.weight.copy_(deq(state[f"l{i}.wqkv"]))
            b.wo.weight.copy_(deq(state[f"l{i}.wo"]))
            b.ffn_norm.copy_(state[f"l{i}.ffn_norm"])
            b.w1.weight.copy_(deq(state[f"l{i}.w1"]))
            b.w2.weight.copy_(deq(state[f"l{i}.w2"]))
    return m
