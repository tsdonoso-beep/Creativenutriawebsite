// La anon key es pública por diseño: va incrustada en cualquier cliente de
// Supabase. Lo que protege los datos es RLS, no esconder esta cadena.
export const URL_SUPA = 'https://npswlvlwrqjxgblolrxi.supabase.co';
export const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3dsdmx3cnFqeGdibG9scnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0Mjg1NjksImV4cCI6MjEwMzAwNDU2OX0.rBVlOVPZFzimCPaw1Ep0z70BorpsBttpWaSxV2kJXnI';

export const MONEDA = 'PEN';
export const REINTENTO_MS = 30_000;

/**
 * Paleta categorica para la barra de distribucion. No la elegi a ojo: mi
 * primera propuesta fallo la validacion de daltonismo, asi que uso el orden
 * de referencia ya validado para pares adyacentes, que es el caso de una
 * barra apilada. Se asignan en orden fijo, nunca ciclando.
 */
export const PALETA = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];
export const PALETA_OSCURA = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
];
/** Gris para el segmento "Otros": es un resto, no una categoria mas. */
export const GRIS_OTROS = '#9aa39c';

/** Cuantas categorias se muestran antes de agrupar en "Otros". */
export const MAX_SEGMENTOS = 6;
