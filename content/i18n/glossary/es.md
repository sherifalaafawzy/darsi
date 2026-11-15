# Darsi: glosario del español (es)

Español latinoamericano neutro, siempre de **tú** (nunca usted ni vosotros; «ustedes» solo para varias personas).
Una sola traducción por término en la interfaz, los cursos, los kits, los Labs, la prueba de nivel y las pantallas del personal.
Los nombres de las rutas salen de las claves `track.*` de `content/i18n/es.json`. Las notas dicen dónde no se aplica la regla.

Reglas de estilo que se repiten
- Registro: tú. Las instrucciones van en imperativo de tú («Elige», «Calcula», «Explica»), también en los paquetes universitarios.
- Comillas: «…» (no “…”). Porcentajes con espacio: «90 %». Símbolos y código tal como en el inglés.
- Números en el texto: punto decimal y coma de miles en la mayoría de los cursos («2.4», «10,800»); los paquetes universitarios y algunos cursos de docentes usan coma decimal. Dentro de un mismo paso no se mezclan, y un elemento del banco y su respuesta son idénticos.
- Los nombres de botones y etiquetas de los Labs se citan con la traducción del propio Lab (`phrases/es/lab-*.json`), entre «…».
- Datos de los Labs que se escriben o se buscan (peticiones de Darsi Tiny, frases de entrenamiento) se citan en inglés, tal como están.
- El guion «·» solo como separador de interfaz (`common.sep`), nunca en texto corrido.

## Plataforma y rutas

| English | Español | Nota |
|---|---|---|
| Darsi | Darsi | no se traduce |
| Darsi Tiny | Darsi Tiny | no se traduce |
| Labs (tab) | Labs | nombre de la pestaña |
| lab (an app) | laboratorio | «el laboratorio de asientos» |
| track | ruta | «Mis rutas», «Todas las rutas» |
| AI | IA | |
| IoT | IoT | |
| Cyber security | Ciberseguridad | |
| Programming | Programación | |
| Data engineering | Ingeniería de datos | |
| AI agents | Agentes de IA | |
| Optimization | Optimización | |
| AI security | Seguridad de la IA | |
| Data science | Ciencia de datos | |
| level | nivel | |
| stage (school stage) | etapa | «¿Dónde estudias?» |
| course / unit | unidad (curso en el catálogo y los textos) | «Unidad completada» |
| lesson | lección | «Lección 1» |
| unit check | evaluación | título «La evaluación» |
| project | proyecto | |
| final project | proyecto final | |
| certificate | certificado | |
| Home / Learn | Aprender | pestaña de inicio |
| Me | Perfil | |
| streak | racha | |

## Partes de una lección

| English | Español | Nota |
|---|---|---|
| Watch | Ver | etiqueta del paso de video |
| Read | Leer | etiqueta del paso de lectura |
| video | video | sin tilde; no «vídeo» |
| transcript | transcripción | |
| checkpoint | pausa y responde | `lesson.pause`; «punto de control» solo en texto técnico |
| key terms | términos clave | |
| worked example | ejemplo resuelto | |
| Try it (Labs step) | Pruébalo | «Try this» = «Prueba esto» |
| Takeaway | Idea clave | |
| Remember and try it | Recuerda y pruébalo | |
| Let's discuss | Conversemos | |
| Look back | Mira atrás | |
| What do you suggest? | ¿Qué sugieres? | |
| Check yourself | Compruébate | versión para estudiantes del boleto de salida |
| Ask | Pregunta | |
| Complete the sentence. | Completa la oración. | |
| Match … | Relaciona … | no «Une» |
| reflection | reflexión | |
| rubric | rúbrica | |
| deliverable / what to submit | entregable / qué debes entregar | |
| team quiz | cuestionario por equipos | |
| exit ticket | boleto de salida | también en los kits y el editor |
| worksheet | hoja de trabajo | |
| activity sheet | hoja de actividades | |
| quiz sheet | hoja del cuestionario | |
| lesson plan | plan de clase | también «plan de clase» para una clase magistral |
| seminar sheet | hoja de seminario | |
| slides | diapositivas | |
| classroom kit | kit para el aula | |
| word bank | banco de palabras | |
| try it tomorrow | Pruébalo mañana en clase | |

## Personas y roles

| English | Español | Nota |
|---|---|---|
| teacher | docente | siempre «docente» (no profesor ni maestro); «sala de profesores» es la excepción idiomática |
| lecturer | docente universitario | |
| head teacher | director / directora | |
| pupil | alumno / alumna | cursos de docentes y textos de aula |
| class (of pupils) | clase | |
| students (the learners in a student's course) | estudiantes | cursos para estudiantes y la interfaz |
| student | estudiante | `role.student` |
| learner (independent) | aprendiz | `role.learner` |
| staff | personal | |
| admin | admin | `role.orgAdmin` |
| platform admin | admin de la plataforma | |
| Mr / Ms / Dr | Sr. / Sra. / Dra. | «Sr. Okafor» en los rótulos; «el señor Okafor» en prosa |
| class teacher | docente titular | |

## IA y aprendizaje automático

| English | Español | Nota |
|---|---|---|
| machine learning | aprendizaje automático | |
| model | modelo | |
| neuron | neurona | |
| neural network | red neuronal | |
| training set | conjunto de entrenamiento | |
| test set | conjunto de prueba | |
| validation set | conjunto de validación | |
| dataset | conjunto de datos | |
| loss | pérdida | |
| learning rate | tasa de aprendizaje | |
| gradient descent | descenso del gradiente | |
| backpropagation | retropropagación | |
| overfitting | sobreajuste | |
| cross-validation | validación cruzada | |
| accuracy | exactitud | UI y Labs también; «precisión» es solo *precision* |
| precision | precisión | |
| recall | exhaustividad | |
| false alarm | falsa alarma | |
| miss (a detection that is not made) | omisión | verbo: «pasa por alto» |
| false positive / false negative | falso positivo / falso negativo | |
| bias (unfairness) | sesgo | |
| confounder | factor de confusión | |
| prompt | prompt | no «indicación» |
| prompt injection | inyección de prompts | |
| token | token | |
| fine-tuning | ajuste fino | |
| embedding | embedding | |
| LLM | LLM | |
| language model | modelo de lenguaje | |
| agent | agente | |
| tool (of an agent) | herramienta | |
| checker (agent role) | verificador | |
| planner | planificador | |
| context window | ventana de contexto | |
| reward | recompensa | |
| policy (RL, and school policy) | política | |
| human approval | aprobación humana | |
| refusal / to refuse | rechazo / rechazar | no «negativa» |
| test suite (evals) | conjunto de pruebas | no «batería de pruebas» |
| trade-off | equilibrio | no «compensación» ni «compromiso» |
| attention | atención | |
| transformer | transformador | |
| detector | detector | |

## Seguridad

| English | Español | Nota |
|---|---|---|
| password | contraseña | |
| password manager | gestor de contraseñas | |
| two-step verification | verificación en dos pasos | también «inicio de sesión en dos pasos» |
| multi-factor authentication | MFA | |
| phishing | phishing | |
| social engineering | ingeniería social | |
| malware | malware | |
| firewall | cortafuegos | |
| hash | hash | la salida: «huella» |
| salt | sal | |
| encryption | cifrado | |
| public key / private key | clave pública / clave privada | |
| backdoor | puerta trasera | |
| poisoning | envenenamiento | |
| adversarial example | ejemplo adversario | |
| threat model | modelo de amenazas | |
| trust boundary | límite de confianza | |
| least privilege | mínimo privilegio | |
| red team | red team | |
| rules of engagement | reglas de compromiso | |
| defence in depth | defensa en profundidad | |
| man-in-the-middle | intermediario (man-in-the-middle) | primera vez; luego «MITM» |
| capture the flag | capture the flag (CTF) | |
| gateway | puerta de enlace | |

## IoT

| English | Español | Nota |
|---|---|---|
| sensor | sensor | |
| battery | batería | «pilas AA» para las pilas desechables |
| duty cycle | ciclo de trabajo | |
| sampling rate | frecuencia de muestreo | |
| sleep mode | modo de reposo | |
| node | nodo | |
| radio | radio | |
| circuit | circuito | |
| voltage | voltaje | |
| threshold | umbral | |
| LED | LED | |
| mobile money | dinero móvil | |
| mesh | red en malla | |

## Datos y programación

| English | Español | Nota |
|---|---|---|
| database | base de datos | |
| table / row / column | tabla / fila / columna | |
| query | consulta | |
| index | índice | |
| join | unir (join en código) | |
| transaction | transacción | |
| normalisation | normalización | |
| data pipeline | flujo de datos | `Pipeline` de scikit-learn se queda en inglés (es código) |
| run log | registro de ejecuciones | |
| loop | bucle | también «ciclo» en el nombre de «ciclo de k-means» |
| function | función | |
| variable | variable | |
| string | cadena | |
| list / array | lista / arreglo | |
| stack / queue | pila / cola | batería ≠ pila de datos |
| recursion | recursión | |
| bug / debug | error / depurar | |
| computer | computadora | no «computador» ni «ordenador» |
| phone | teléfono | |
| whiteboard | pizarra | no «pizarrón» |
| file | archivo | |
| email | correo | |
| app | app | |

## Optimización

| English | Español | Nota |
|---|---|---|
| linear programming (LP) | programación lineal (PL) | |
| LP relaxation | relajación lineal | |
| shadow price | precio sombra | |
| branch and bound | ramificación y acotamiento | |
| knapsack | mochila | |
| local search | búsqueda local | |
| hill climbing | ascenso de colina | |
| simulated annealing | recocido simulado | |
| constraint | restricción | |
| objective | objetivo | |
| solver | solucionador | |
| graph colouring | coloración de grafos | |
| greedy | voraz | |

## Verbos de la interfaz
Pulsar: «pulsa» (como en toda la interfaz); tocar: «toca». No mezclar con «presiona».
