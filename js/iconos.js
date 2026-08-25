// Iconografía propia. Trazos de 1.7 con extremos redondeados, en la línea de
// SF Symbols, para que conviva con el resto de la interfaz de iOS.
// Los emojis quedaron fuera a propósito: cambian de forma en cada dispositivo.

const trazo = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round" width="22" height="22"
        aria-hidden="true">${d}${extra}</svg>`;

export const iconos = {
  casa:      trazo('<path d="M3.6 10.4 12 4l8.4 6.4V19a1.4 1.4 0 0 1-1.4 1.4H5A1.4 1.4 0 0 1 3.6 19z"/><path d="M9.6 20.4v-6.2h4.8v6.2"/>'),
  recibo:    trazo('<path d="M5.4 3.6h13.2v16.9l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4z"/><path d="M9 8.4h6M9 12.2h6"/>'),
  carrito:   trazo('<path d="M2.8 3.6h2.3l2.2 10.6h9.9l2-7.6H6.2"/><circle cx="9.4" cy="19" r="1.5"/><circle cx="16.8" cy="19" r="1.5"/>'),
  escoba:    trazo('<path d="M14.6 3.4 9.9 8.1"/><path d="M7.2 9.6 5 11.9l7.1 7.1 2.3-2.3z"/><path d="m12.1 19 6.9-3.3a3.6 3.6 0 0 0 1.7-4.9l-.9-1.9-8.3 4z"/>'),
  balanza:   trazo('<path d="M12 3.6v16.8M5.4 20.4h13.2"/><path d="M6.6 7.2h10.8"/><path d="m6.6 7.2-2.8 6a3 3 0 0 0 5.6 0z"/><path d="m17.4 7.2-2.8 6a3 3 0 0 0 5.6 0z"/>'),
  mas:       trazo('<path d="M12 5.5v13M5.5 12h13"/>'),
  camara:    trazo('<path d="M3.6 8.6a1.6 1.6 0 0 1 1.6-1.6h2.1l1.3-2.1h6.8l1.3 2.1h2.1a1.6 1.6 0 0 1 1.6 1.6v9.2a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6z"/><circle cx="12" cy="12.8" r="3.4"/>'),
  chulo:     trazo('<path d="m5 12.6 4.6 4.6L19 7.4"/>'),
  destello:  trazo('<path d="M12 3.2 13.9 9l5.9 1.9-5.9 1.9L12 18.8 10.1 12.8 4.2 10.9 10.1 9z"/><path d="M18.6 16.4l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/>'),
  cerrar:    trazo('<path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"/>'),
  reloj:     trazo('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.1 1.9"/>'),
  nube:      trazo('<path d="M6.9 18.4a3.9 3.9 0 0 1-.4-7.8 5.3 5.3 0 0 1 10.2-1.2 3.7 3.7 0 0 1 .5 7.4z"/><path d="M12 12.4v5.6M9.6 15.8 12 18.2l2.4-2.4"/>'),
  basura:    trazo('<path d="M4.6 6.6h14.8M9.4 6.6V4.8h5.2v1.8"/><path d="M6.6 6.6 7.5 19a1.4 1.4 0 0 0 1.4 1.3h6.2a1.4 1.4 0 0 0 1.4-1.3l.9-12.4"/><path d="M10.4 10.4v6M13.6 10.4v6"/>'),
  platos:    trazo('<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.6"/>'),
  bano:      trazo('<path d="M4.2 12.4h15.6v1.6a5.4 5.4 0 0 1-5.4 5.4H9.6a5.4 5.4 0 0 1-5.4-5.4z"/><path d="M7.4 12.4V6.2a1.8 1.8 0 0 1 3.6 0"/><path d="m8.4 19.4-1 1.8M15.6 19.4l1 1.8"/>'),
  piso:      trazo('<path d="M3.4 20.6h17.2"/><path d="M6.4 20.6V9.4h11.2v11.2"/><path d="M6.4 14.6h11.2M12 9.4v11.2"/><path d="M4.6 9.4 12 3.4l7.4 6"/>'),
  ropa:      trazo('<path d="M9 4.4 4.6 7.2l1.6 3.4 1.8-.9v9.9h8v-9.9l1.8.9 1.6-3.4L15 4.4a3.1 3.1 0 0 1-6 0z"/>'),
  sabanas:   trazo('<path d="M3.4 17.4v-6a3 3 0 0 1 3-3h11.2a3 3 0 0 1 3 3v6"/><path d="M3.4 17.4h17.2v3H3.4z"/><path d="M7.4 8.4V6.6a1.8 1.8 0 0 1 1.8-1.8h5.6a1.8 1.8 0 0 1 1.8 1.8v1.8"/>'),
  cocina:    trazo('<path d="M4.6 9.4h14.8v9.6a1.4 1.4 0 0 1-1.4 1.4H6a1.4 1.4 0 0 1-1.4-1.4z"/><path d="M4.6 9.4V6.4a1.4 1.4 0 0 1 1.4-1.4h12a1.4 1.4 0 0 1 1.4 1.4v3"/><path d="M8.4 13.4v3M12 13.4v3M15.6 13.4v3"/>'),
  calendario: trazo('<rect x="3.6" y="5.4" width="16.8" height="15" rx="2.2"/><path d="M3.6 10h16.8M8.4 3.4v3.4M15.6 3.4v3.4"/><path d="M8.4 14h2M13.6 14h2"/>'),
  alerta:     trazo('<path d="M12 4.2 21 19.4H3z"/><path d="M12 10v4M12 16.6v.1"/>'),
  subir:      trazo('<path d="M12 16.4V4.6"/><path d="m7.4 9.2 4.6-4.6 4.6 4.6"/><path d="M4.6 15.4v3a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6v-3"/>'),
  tarea:     trazo('<path d="M5.4 4.6h13.2v15.8H5.4z"/><path d="m8.6 11.4 2 2 4.2-4.2"/>'),
};

/**
 * La nutria de la casa. Cabeza redonda, hocico ancho y bigotes: lo justo para
 * que se lea a 24px en la barra de pestañas y a 512 en el icono de la app.
 */
export function nutria(tam = 40, color = 'currentColor') {
  return `<svg viewBox="0 0 64 64" width="${tam}" height="${tam}" aria-hidden="true" fill="none">
    <g fill="${color}">
      <ellipse cx="16.5" cy="16.5" rx="5.6" ry="5.8"/>
      <ellipse cx="47.5" cy="16.5" rx="5.6" ry="5.8"/>
      <ellipse cx="32" cy="35" rx="23.5" ry="20"/>
    </g>
    <ellipse cx="32" cy="41.5" rx="13.2" ry="10.4" fill="#FFFDF8" opacity=".95"/>
    <circle cx="23.6" cy="30.5" r="3.05" fill="#1B211E"/>
    <circle cx="40.4" cy="30.5" r="3.05" fill="#1B211E"/>
    <circle cx="24.7" cy="29.4" r="1.05" fill="#FFFDF8"/>
    <circle cx="41.5" cy="29.4" r="1.05" fill="#FFFDF8"/>
    <path d="M32 36.4c2.5 0 4.1 1.5 4.1 3.1 0 1.9-1.9 3.1-4.1 3.1s-4.1-1.2-4.1-3.1c0-1.6 1.6-3.1 4.1-3.1z" fill="#1B211E"/>
    <path d="M32 42.6v2.6M32 45.2c-1.9 0-3.4 1.2-3.4 2.6M32 45.2c1.9 0 3.4 1.2 3.4 2.6"
          stroke="#1B211E" stroke-width="1.7" stroke-linecap="round"/>
    <g stroke="#1B211E" stroke-width="1.35" stroke-linecap="round" opacity=".55">
      <path d="M17.5 38.5 8.8 36.6M17.6 41.4 9.4 42.2M46.5 38.5l8.7-1.9M46.4 41.4l8.2.8"/>
    </g>
  </svg>`;
}

/** Nutria dormida, para los estados vacíos. */
export function nutriaDormida(tam = 64, color = 'currentColor') {
  return `<svg viewBox="0 0 64 64" width="${tam}" height="${tam}" aria-hidden="true" fill="none">
    <g fill="${color}" opacity=".5">
      <ellipse cx="16.5" cy="18.5" rx="5.4" ry="5.6"/>
      <ellipse cx="47.5" cy="18.5" rx="5.4" ry="5.6"/>
      <ellipse cx="32" cy="36" rx="23" ry="19.5"/>
    </g>
    <ellipse cx="32" cy="42" rx="12.8" ry="10" fill="var(--card)" opacity=".9"/>
    <path d="M20.4 31.5c1.1-1.4 4.3-1.4 5.4 0M38.2 31.5c1.1-1.4 4.3-1.4 5.4 0"
          stroke="currentColor" stroke-width="1.9" stroke-linecap="round" opacity=".8"/>
    <path d="M32 37.4c2.3 0 3.8 1.4 3.8 2.9s-1.7 2.9-3.8 2.9-3.8-1.4-3.8-2.9 1.5-2.9 3.8-2.9z"
          fill="currentColor" opacity=".8"/>
    <path d="M48 14h6l-6 7h6" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" opacity=".45"/>
    <path d="M56 5h4.5l-4.5 5h4.5" stroke="currentColor" stroke-width="1.6"
          stroke-linecap="round" stroke-linejoin="round" opacity=".3"/>
  </svg>`;
}
