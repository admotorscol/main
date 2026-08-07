/* ============================================================
   CONFIGURACIÓN DE AD MOTORS
   Edita estos valores para conectar tu proyecto.
   ============================================================ */

const ADMOTORS_CONFIG = {

  /* URL de tu Web App de Google Apps Script (Code.gs + README en /gs).
     Formato: https://script.google.com/macros/s/XXXXX/exec */
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxgoKHr8Qul4TRnquTsGLJLbzeQ1FCm6zVUhRzQ7fLba3wXoh9wVgRLfGnO5BMx1nJ7/exec",

  /* Número de WhatsApp del botón CTA (solo dígitos, con código de país).
     Ej: +57 311 2656085  ->  573112656085 */
  WHATSAPP_NUMBER: "573112656085",

  /* Mensaje predefinido para el botón de WhatsApp */
  WHATSAPP_MESSAGE: "Hola AD Motors! Quiero información sobre un auto de su inventario.",

  /* Imagen de respaldo si una fila no trae URL de imagen */
  DEFAULT_IMAGE: "https://picsum.photos/seed/admotors/800/1200",

  /* Porcentaje mínimo de la barra de puja sobre el valor del auto */
  BID_MIN_PERCENT: 70,

  /* Valor por defecto del slider (porcentaje del precio): 90% */
  BID_DEFAULT_PERCENT: 90,

  /* Paso del slider en pesos colombianos */
  BID_STEP: 100000,

  /* URL completa de tu video de YouTube del modal "Cómo funciona"
     Ej: https://www.youtube.com/watch?v=VIDEO_ID o https://youtu.be/VIDEO_ID */
  YOUTUBE_URL: "https://www.youtube.com/watch?v=RQ1YwgMtaGo"
};
