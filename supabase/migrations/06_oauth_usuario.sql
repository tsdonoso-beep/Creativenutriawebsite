-- Pasamos de service account a OAuth de usuario: Google ya no permite que una
-- service account escriba archivos en carpetas de "Mi unidad".

alter table configuracion
  add column if not exists google_refresh_token text,
  add column if not exists oauth_setup_key      text;

-- La carpeta compartida a mano deja de servir: con scope drive.file la app
-- solo ve lo que ella crea, así que se crea su propia carpeta raíz.
update configuracion
set drive_parent_id      = null,
    drive_root_folder_id = null,
    oauth_setup_key      = encode(gen_random_bytes(16), 'hex'),
    actualizado_en       = now()
where id = 1;
