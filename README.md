# Ale & Aris Backend Relay Server

Este es el servidor backend personalizado para sincronizar la base de datos de Ale & Aris de forma totalmente descentralizada mediante HTTP y WebSockets. 

## Características
- **Historial Seguro**: Almacena temporalmente los últimos 1000 eventos cifrados por canal (`syncId`).
- **WebSockets en Tiempo Real**: Retransmite los mensajes instantáneamente a todos los dispositivos conectados.
- **Sin Límites**: Elimina las restricciones de Rate Limits e emails de `kvdb.io` y `ntfy.sh`.

## Despliegue en Render (Gratis)

1. Sube este proyecto o solo la carpeta `backend` a tu cuenta de **GitHub**.
2. Entra en [Render](https://render.com) e inicia sesión.
3. Haz clic en **New +** y selecciona **Web Service**.
4. Conecta tu repositorio de GitHub.
5. Configura los siguientes campos:
   - **Name**: `ale-aris-backend` (o el nombre que prefieras)
   - **Language**: `Node`
   - **Branch**: `main` (o tu rama principal)
   - **Root Directory**: `backend` (si lo pusiste en una subcarpeta) o déjalo vacío si está en la raíz del repositorio.
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
6. Haz clic en **Deploy Web Service**.
7. Copia la URL generada (ej. `https://ale-aris-backend.onrender.com`).
8. Configura esa URL en la pantalla `admin.html` del dashboard y en la constante `BACKEND_URL` de la app Android.
