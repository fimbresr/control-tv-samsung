# Samsung Remote · Control local

PWA estática para controlar un Samsung 7 Series desde Android Chrome, conectándose directamente a la TV en la red local.

## Alcance y requisitos

- Requiere Chrome **154 o posterior en Android** y abrir la PWA por HTTPS. No se ofrece compatibilidad con Chrome para iPhone en esta versión.
- El teléfono y la TV deben estar conectados a la misma red local. Tras emparejarse, la PWA queda ligada a esa IP privada y no permite cambiarla sin borrar el emparejamiento.
- Chrome puede pedir permiso para acceder a la red local. Se debe permitir.
- La TV debe estar encendida para conectarse. El canal de control por red no puede despertar la TV cuando ya está en reposo.
- En el primer emparejamiento, aceptar la solicitud que se muestra en la pantalla de la TV.
- La PWA no puede comprobar el SSID ni distinguir redes con rutas entre ellas; el navegador no expone el nombre del Wi‑Fi. El control solo funcionará donde Chrome pueda alcanzar la IP privada emparejada de la TV. No se debe interpretar como una verificación de identidad de la red del hospital.
- Conviene reservar una IP para la TV en el router de la red para evitar que cambie.

## Token y privacidad

El token que entrega la TV se guarda en `localStorage` de este navegador y se envía únicamente a la IP privada emparejada de la TV. No se transmite a GitHub Pages. Al cumplirse 24 horas desde el emparejamiento, la app borra el token local y deja de enviar controles; hay que conectar de nuevo y autorizar el teléfono desde la TV. El botón **Olvidar TV** lo borra antes.

La caducidad de 24 horas la hace cumplir la app en este navegador; no revoca criptográficamente el token que la TV ya emitió. La TV puede conservar su propio registro de dispositivos autorizados. El token se guarda en el almacenamiento local del navegador y depende del reloj del teléfono; borrarlo desde la app elimina el acceso de esta PWA en este navegador. Si la TV vuelve a entregar el mismo token al reconectar dentro de esas 24 horas, el plazo original se conserva.

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta a la rama `main` de un repositorio GitHub.
2. En **Settings → Pages → Build and deployment**, elige **GitHub Actions**.
3. El workflow `Deploy to GitHub Pages` publica la PWA al actualizar `main`.
4. Abre la URL HTTPS publicada en Chrome 154+ para Android, permite acceso a la red local e instala la app desde el menú de Chrome.

La app no requiere backend, base de datos, cuentas, SmartThings, Google Sheets ni secretos del lado del servidor.
