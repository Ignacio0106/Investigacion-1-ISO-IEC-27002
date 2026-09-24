const PHASE_INFO = {
  1: { name: 'Preguntados', icon: '🎯', color: '#2e9be0', desc: 'Ronda de 8 preguntas sobre la norma ISO/IEC 27002.' },
  2: { name: 'Sorting Express', icon: '🗂️', color: '#38b6a0', desc: 'Clasifica cada control en su categoría (Organizacional / Personas / Físicos / Tecnológicos). Tienes 30 s por tarjeta.' },
  3: { name: 'Caza de Vulnerabilidades', icon: '🕵️', color: '#9b6dd6', desc: 'Selecciona solo los controles adecuados para resolver cada caso práctico. Tienes 2 minutos.' },
  4: { name: 'SOC Manager', icon: '🛡️', color: '#e8a33d', desc: 'Compra controles con tu presupuesto y mitiga 3 ataques antes de que ocurran.' },
  5: { name: 'Debate Express', icon: '🗣️', color: '#f0536b', desc: 'Vota rápido: ¿es una ventaja, una limitación o un mito/falso de la norma?' }
};

const P2_OPTIONS = [
  { id: 'org', name: 'Organizacional', tip: 'Políticas, roles y gestión', color: '#2e9be0' },
  { id: 'pers', name: 'Personas', tip: 'Factor humano y cultura', color: '#f0536b' },
  { id: 'fis', name: 'Físicos', tip: 'Instalaciones y entorno', color: '#38b6a0' },
  { id: 'tec', name: 'Tecnológicos', tip: 'Sistemas, redes y datos', color: '#9b6dd6' }
];

const P2_CARDS = [
  { text: 'Política de seguridad de la información aprobada por la dirección', cat: 'org' },
  { text: 'Asignación de funciones y responsabilidades de seguridad', cat: 'org' },
  { text: 'Evaluación y tratamiento de riesgos de seguridad', cat: 'org' },
  { text: 'Acuerdos con proveedores y cadena de suministro', cat: 'org' },
  { text: 'Clasificación y etiquetado de la información', cat: 'org' },
  { text: 'Términos y condiciones de empleo y contratos', cat: 'pers' },
  { text: 'Verificación de antecedentes del personal', cat: 'pers' },
  { text: 'Programa de concientización y capacitación en seguridad', cat: 'pers' },
  { text: 'Acuerdos de confidencialidad con el personal', cat: 'pers' },
  { text: 'Perímetros de seguridad física de las instalaciones', cat: 'fis' },
  { text: 'Controles de acceso físico (tarjetas, biométricos)', cat: 'fis' },
  { text: 'Escritorio y pantalla limpia', cat: 'fis' },
  { text: 'Protección de instalaciones ante incendios, agua o fallos eléctricos', cat: 'fis' },
  { text: 'Cifrado de datos en reposo y en tránsito', cat: 'tec' },
  { text: 'Autenticación multifactor', cat: 'tec' },
  { text: 'Protección contra malware y software malicioso', cat: 'tec' },
  { text: 'Copias de seguridad de la información', cat: 'tec' },
  { text: 'Gestión de parches y vulnerabilidades técnicas', cat: 'tec' },
  { text: 'Monitoreo de eventos y seguridad de la red', cat: 'tec' },
  { text: 'Control de accesos lógicos con mínimo privilegio', cat: 'tec' }
];

const P3_SCENARIOS = [
  {
    title: 'Caso: claves compartidas y cuentas fantasma',
    text: 'El profesor Juan comparte su clave del sistema de notas con un administrativo "solo para ver una vez", y siguen activas las cuentas de 3 exfuncionarios.',
    controls: [
      { id: 'c1', text: 'Revocar cuentas de exfuncionarios al finalizar la relación', needed: true },
      { id: 'c2', text: 'Política de credenciales personales: no compartir contraseñas', needed: true },
      { id: 'c3', text: 'Accesos según rol con mínimo privilegio', needed: true },
      { id: 'c4', text: 'Auditoría periódica de cuentas y accesos activos', needed: true },
      { id: 'c5', text: 'Capacitación sobre el uso seguro de credenciales', needed: true },
      { id: 'c6', text: 'Registro y monitoreo de accesos al sistema de notas', needed: true },
      { id: 'c7', text: 'Comprar un sistema informático totalmente nuevo', needed: false },
      { id: 'c8', text: 'Contratar un seguro contra daños a los equipos', needed: false },
      { id: 'c9', text: 'Instalar cámaras de seguridad en la sala de servidores', needed: false },
      { id: 'c10', text: 'Cifrar la red WiFi del edificio únicamente', needed: false }
    ]
  },
  {
    title: 'Caso: phishing y rescate por ransomware',
    text: 'La asistente abrió un correo con un adjunto infectado. Los archivos fueron cifrados y la organización pagó un rescate: no había copias de seguridad.',
    controls: [
      { id: 'c1', text: 'Copias de seguridad 3-2-1 con pruebas de restauración', needed: true },
      { id: 'c2', text: 'Filtrado antispam y protección contra malware en el correo', needed: true },
      { id: 'c3', text: 'Capacitación para detectar correos de phishing', needed: true },
      { id: 'c4', text: 'Plan de respuesta a incidentes: aislar equipos infectados', needed: true },
      { id: 'c5', text: 'Segmentación de los sistemas críticos en la red', needed: true },
      { id: 'c6', text: 'Bloqueo de macros con ejecución automática en documentos', needed: true },
      { id: 'c7', text: 'Verificación de antecedentes del proveedor de café', needed: false },
      { id: 'c8', text: 'Abrir el adjunto para analizarlo manualmente', needed: false },
      { id: 'c9', text: 'Comprar extintores para la sala de servidores', needed: false },
      { id: 'c10', text: 'Adquirir una impresora multifunción nueva', needed: false }
    ]
  },
  {
    title: 'Caso: robo de portátiles',
    text: 'Tres laptops con datos de estudiantes fueron robadas de una oficina sin control de acceso al edificio ni dispositivos asegurados.',
    controls: [
      { id: 'c1', text: 'Perímetro y control de acceso físico al edificio', needed: true },
      { id: 'c2', text: 'Armarios o anclajes de seguridad para los equipos', needed: true },
      { id: 'c3', text: 'Cifrado de los discos de los portátiles', needed: true },
      { id: 'c4', text: 'Inventario y registro de activos y equipos', needed: true },
      { id: 'c5', text: 'Verificación de antecedentes y supervisión del personal de limpieza', needed: true },
      { id: 'c6', text: 'Cámaras de vigilancia en entradas y pasillos', needed: true },
      { id: 'c7', text: 'Publicar la ubicación de los servidores en redes sociales', needed: false },
      { id: 'c8', text: 'Contratar un seguro contra robo de equipos', needed: false },
      { id: 'c9', text: 'Política de teletrabajo permanente para todo el personal', needed: false },
      { id: 'c10', text: 'Guardar copias impresas de los datos en el escritorio', needed: false }
    ]
  },
  {
    title: 'Caso: proveedor en la nube',
    text: 'La nómina se procesa en la nube de un proveedor sin contrato de seguridad. El acuerdo no define cómo proteger los datos personales de los empleados.',
    controls: [
      { id: 'c1', text: 'Evaluación de seguridad del proveedor antes de contratar', needed: true },
      { id: 'c2', text: 'Cláusulas de protección de datos personales en el contrato', needed: true },
      { id: 'c3', text: 'Acuerdo de nivel de servicio (SLA) y continuidad', needed: true },
      { id: 'c4', text: 'Cifrado de los datos personales procesados', needed: true },
      { id: 'c5', text: 'Monitoreo y gestión del acceso del proveedor', needed: true },
      { id: 'c6', text: 'Condiciones claras de terminación y traspaso de datos', needed: true },
      { id: 'c7', text: 'Imprimir la nómina y archivarla en papel', needed: false },
      { id: 'c8', text: 'Comprar más servidores locales para reemplazar la nube', needed: false },
      { id: 'c9', text: 'Verificar los antecedentes de todos los clientes', needed: false },
      { id: 'c10', text: 'Instalar ventiladores adicionales en el centro de datos', needed: false }
    ]
  }
];

const P4_SHOP = [
  { id: 'mfa', name: 'Autenticación multifactor', desc: 'Bloquea accesos con credenciales robadas.', price: 2000 },
  { id: 'training', name: 'Capacitación y concientización', desc: 'El personal detecta engaños y phishing.', price: 1000 },
  { id: 'iam', name: 'Gestión de accesos y cuentas', desc: 'Revoca cuentas y aplica mínimo privilegio.', price: 2000 },
  { id: 'backup', name: 'Copias de seguridad 3-2-1', desc: 'Recupera la información tras un cifrado.', price: 1500 },
  { id: 'edr', name: 'Antivirus / EDR', desc: 'Detecta y responde malware en los equipos.', price: 2500 },
  { id: 'firewall', name: 'Firewall y segmentación', desc: 'Aísla la red y limita el movimiento lateral.', price: 3000 },
  { id: 'patching', name: 'Gestión de parches', desc: 'Cierra vulnerabilidades conocidas.', price: 1000 },
  { id: 'siem', name: 'Monitoreo y SIEM', desc: 'Detecta actividad anómala en tiempo real.', price: 3000 }
];

const P4_ATTACKS = [
  { id: 'atk1', name: 'Phishing dirigido', desc: 'Un correo suplantando al director busca credenciales de la nómina.', required: ['mfa', 'training'], damage: 2500 },
  { id: 'atk2', name: 'Ransomware', desc: 'Malware cifra los archivos compartidos y exige un rescate.', required: ['backup', 'edr'], damage: 3500 },
  { id: 'atk3', name: 'Cuentas comprometidas', desc: 'Atacantes entran con cuentas de empleados que siguen activas.', required: ['iam', 'mfa'], damage: 3000 }
];

const P5_STATEMENTS = [
  { text: 'La norma indica exactamente qué software específico debe comprar cada empresa.', answer: 'mito', explanation: 'Es una guía de controles de referencia, no una lista de productos.' },
  { text: 'La norma se adapta a cualquier tamaño de empresa.', answer: 'ventaja', explanation: 'Los controles se implementan de forma proporcional al contexto de cada organización.' },
  { text: 'ISO/IEC 27002 es certificable por sí misma.', answer: 'mito', explanation: 'No es certificable; quien se certifica es contra ISO/IEC 27001. La 27002 es una guía.' },
  { text: 'Ofrece controles de referencia alineados con ISO/IEC 27001.', answer: 'ventaja', explanation: 'La Anexo A de 27001 se basa en los controles de la 27002.' },
  { text: 'Puede resultar extensa y compleja de aplicar en organizaciones pequeñas.', answer: 'limitacion', explanation: 'Requiere priorizar y adaptar los controles según el riesgo y los recursos.' },
  { text: 'Exige implementar todos sus controles sin excepción.', answer: 'mito', explanation: 'La organización selecciona los controles según su análisis de riesgos.' },
  { text: 'Ayuda a estandarizar la seguridad con buenas prácticas internacionales.', answer: 'ventaja', explanation: 'Basada en buenas prácticas ampliamente aceptadas en la industria.' },
  { text: 'No menciona la relación con proveedores ni terceros.', answer: 'mito', explanation: 'Incluye controles sobre la seguridad en las relaciones con proveedores.' }
];

module.exports = { PHASE_INFO, P2_OPTIONS, P2_CARDS, P3_SCENARIOS, P4_SHOP, P4_ATTACKS, P5_STATEMENTS };