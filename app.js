/* Interfaz de la presentación: Configuración con MQTT (ABRetos, UNIFRANZ) */
(function () {
  'use strict';
  var MQ = window.MQ, S = MQ.S, B = MQ.B;

  /* ================= utilidades ================= */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); }
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === false || v === null || v === undefined) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduceMotion ? Math.min(ms, 60) : ms); }); }

  function copyText(t, btn) {
    function ok() { if (btn) { var o = btn.getAttribute('data-o') || btn.textContent; btn.setAttribute('data-o', o); btn.textContent = 'Copiado'; setTimeout(function () { btn.textContent = o; }, 1400); } }
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;left:-999px;top:0' });
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { /* sin permiso */ }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fallback);
    else fallback();
  }

  /* ---------- coloreado de código ---------- */
  function colorConf(line) {
    if (/^\s*#/.test(line)) return '<span class="c">' + esc(line) + '</span>';
    var m = line.match(/^(\S+)(\s+)(.*)$/);
    if (!m) return '<span class="d">' + esc(line) + '</span>';
    return '<span class="d">' + esc(m[1]) + '</span>' + esc(m[2]) + '<span class="v">' + esc(m[3]) + '</span>';
  }
  function colorSh(line) {
    if (/^\s*#/.test(line)) return '<span class="c">' + esc(line) + '</span>';
    var parts = line.match(/('[^']*'|"[^"]*"|\s+|\S+)/g) || [], out = '', first = true;
    parts.forEach(function (p) {
      if (/^\s+$/.test(p)) { out += p; return; }
      if (first) { out += '<span class="k">' + esc(p) + '</span>'; first = false; }
      else if (/^['"]/.test(p)) out += '<span class="s">' + esc(p) + '</span>';
      else if (/^-/.test(p)) out += '<span class="d">' + esc(p) + '</span>';
      else out += esc(p);
    });
    return out;
  }
  function colorCode(line, lang) {
    var out = '', i = 0, n = line.length, cm = lang === 'py' ? '#' : '//';
    var kw = lang === 'py' ? /^(import|from|def|if|else|return|print|True|False|None|as|while|for|in|not|and|or)$/ : /^(const|int|void|if|else|while|for|return|static|unsigned|char|byte|long|true|false|NULL|nullptr|bool|boolean)$/;
    while (i < n) {
      var ch = line.charAt(i), j;
      if (line.substr(i, cm.length) === cm) { out += '<span class="c">' + esc(line.slice(i)) + '</span>'; break; }
      if (ch === '"') { j = i + 1; while (j < n && line.charAt(j) !== '"') { if (line.charAt(j) === '\\') j++; j++; } out += '<span class="s">' + esc(line.slice(i, j + 1)) + '</span>'; i = j + 1; continue; }
      if (/[A-Za-z_]/.test(ch)) { j = i; while (j < n && /[A-Za-z0-9_]/.test(line.charAt(j))) j++; var w = line.slice(i, j); out += kw.test(w) ? '<span class="k">' + w + '</span>' : esc(w); i = j; continue; }
      if (/[0-9]/.test(ch)) { j = i; while (j < n && /[0-9.]/.test(line.charAt(j))) j++; out += '<span class="v">' + esc(line.slice(i, j)) + '</span>'; i = j; continue; }
      out += esc(ch); i++;
    }
    return out;
  }
  function colorize(line, lang) {
    if (lang === 'conf') return colorConf(line);
    if (lang === 'sh') return colorSh(line);
    return colorCode(line, lang);
  }

  /* caja de código con botón Copiar */
  function codeBox(title, lang) {
    var pre = h('pre'), tl = h('span', { text: title });
    var btn = h('button', { type: 'button', text: 'Copiar' });
    var box = h('div', { class: 'codigo' }, h('div', { class: 'cab' }, tl, btn), pre);
    var cur = '';
    btn.addEventListener('click', function () { copyText(cur, btn); });
    return {
      el: box,
      title: function (t) { tl.textContent = t; },
      set: function (lines) {
        cur = lines.map(function (l) { return typeof l === 'string' ? l : l.txt; }).join('\n') + '\n';
        pre.innerHTML = '';
        lines.forEach(function (l, i) {
          var t = typeof l === 'string' ? l : l.txt;
          var sp = h('span', { class: 'ln', 'data-i': String(i), html: t === '' ? ' ' : colorize(t, lang) });
          pre.appendChild(sp);
        });
      },
      lines: function () { return $$('.ln', pre); }
    };
  }

  /* registro del broker (varias instancias) */
  var logBoxes = [];
  function logBox(title) {
    var ol = h('ol'), clear = h('button', { type: 'button', text: 'Limpiar', onclick: function () { MQ.clearLogs(); } });
    var box = h('div', { class: 'registro', 'aria-live': 'polite' }, h('div', { class: 'cab' }, h('span', { text: title || 'Registro del broker (mosquitto.log)' }), clear), ol);
    function empty() { ol.innerHTML = ''; ol.appendChild(h('li', { class: 'vac', text: 'Aquí aparece lo que escribiría Mosquitto. Conecta un cliente para verlo.' })); }
    function addEntry(e) {
      if (!e) { empty(); return; }
      var first = ol.firstChild; if (first && first.className === 'vac') ol.innerHTML = '';
      var li = h('li', { class: e.kind || '' }, h('span', { class: 't', text: e.t }), e.text);
      if (e.es) li.appendChild(h('span', { class: 'es', text: e.es }));
      ol.appendChild(li);
      while (ol.children.length > 80) ol.removeChild(ol.firstChild);
      ol.scrollTop = ol.scrollHeight;
    }
    var o = { el: box, add: addEntry, reset: function () { empty(); B.logs.forEach(addEntry); } };
    empty(); B.logs.forEach(addEntry);
    logBoxes.push(o);
    return o;
  }
  MQ.onLog(function (e) { logBoxes.forEach(function (b) { b.add(e); }); });

  /* controles */
  function sw(label, sub, onchange) {
    var inp = h('input', { type: 'checkbox' });
    inp.addEventListener('change', function () { onchange(inp.checked); });
    var el = h('label', { class: 'sw' }, inp, h('span', { class: 'pista' }), h('span', null, label, sub ? h('small', { text: sub }) : null));
    return { el: el, inp: inp };
  }
  function numField(label, get, min, max, set, cls, help) {
    var inp = h('input', { type: 'number', min: String(min), max: String(max), id: 'n' + Math.random().toString(36).slice(2, 8) });
    inp.value = get();
    inp.addEventListener('change', function () {
      var v = parseInt(inp.value, 10);
      if (isNaN(v) || v < min || v > max) { inp.value = get(); return; }
      set(v);
    });
    var wrap = h('div', { class: 'campo ' + (cls || '') }, h('label', { for: inp.id, text: label }), inp);
    return { el: wrap, inp: inp, sync: function () { inp.value = get(); } };
  }
  function textField(label, value, onchange, cls, type) {
    var inp = h('input', { type: type || 'text', id: 't' + Math.random().toString(36).slice(2, 8), autocomplete: 'off', spellcheck: 'false' });
    inp.value = value;
    inp.addEventListener('input', function () { onchange(inp.value); });
    var wrap = h('div', { class: 'campo ' + (cls || '') }, h('label', { for: inp.id, text: label }), inp);
    return { el: wrap, inp: inp };
  }
  function selectField(label, options, value, onchange, cls) {
    var sel = h('select', { id: 's' + Math.random().toString(36).slice(2, 8) });
    options.forEach(function (o) { sel.appendChild(h('option', { value: o[0], text: o[1] })); });
    sel.value = value;
    sel.addEventListener('change', function () { onchange(sel.value); });
    return { el: h('div', { class: 'campo ' + (cls || '') }, h('label', { for: sel.id, text: label }), sel), sel: sel };
  }
  function segmented(name, options, value, onchange) {
    var wrap = h('div', { class: 'seg', role: 'radiogroup' });
    var inputs = [];
    options.forEach(function (o) {
      var inp = h('input', { type: 'radio', name: name, value: o[0] });
      inp.checked = o[0] === value;
      inp.addEventListener('change', function () { if (inp.checked) onchange(o[0]); });
      inputs.push(inp);
      wrap.appendChild(h('label', null, inp, h('span', { text: o[1] })));
    });
    return { el: wrap, set: function (v) { inputs.forEach(function (i) { i.checked = i.value === v; }); } };
  }
  function tabsBar(items, onpick, cls) {
    var bar = h('div', { class: 'tabs ' + (cls || ''), role: 'tablist' });
    var btns = items.map(function (it, i) {
      var b = h('button', { type: 'button', role: 'tab', 'aria-selected': i === 0 ? 'true' : 'false', text: it[1], onclick: function () { pick(i); } });
      bar.appendChild(b); return b;
    });
    function pick(i) { btns.forEach(function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); }); onpick(items[i][0], i); }
    return { el: bar, pick: pick };
  }
  function grupo(titulo, peq) {
    var g = h('div', { class: 'grupo' }, h('h4', { text: titulo }), peq ? h('p', { class: 'peq', text: peq }) : null);
    for (var i = 2; i < arguments.length; i++) add(g, arguments[i]);
    return g;
  }
  function labShell(titulo, ayuda, cls) {
    var cuerpo = h('div', { class: 'lab-cuerpo ' + (cls || '') });
    var el = h('div', { class: 'lab' }, h('div', { class: 'lab-cab' }, h('h3', { text: titulo }), ayuda ? h('p', { class: 'ayuda', text: ayuda }) : null), cuerpo);
    return { el: el, body: cuerpo };
  }
  function irA(id) { var t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }

  /* ================= navegación ================= */
  var SECCIONES = [['mapa', 'Mapa'], ['broker', 'Broker'], ['permisos', 'Permisos'], ['cliente', 'Cliente'], ['terminal', 'Terminales'], ['codigo', 'Código'], ['diagnostico', 'Diagnóstico'], ['repaso', 'Repaso'], ['resumen', 'Resumen']];
  function buildNav() {
    var pills = $('#pills'), rail = $('#rail');
    rail.appendChild(h('li', { class: 'hilo', id: 'hilo', 'aria-hidden': 'true' }));
    SECCIONES.forEach(function (s) {
      pills.appendChild(h('a', { href: '#' + s[0], 'data-id': s[0], text: s[1] }));
      rail.appendChild(h('li', null, h('a', { href: '#' + s[0], 'data-id': s[0], text: s[1] })));
    });
    function spy() {
      var cur = -1;
      SECCIONES.forEach(function (s, i) { var e = document.getElementById(s[0]); if (e && e.getBoundingClientRect().top < 180) cur = i; });
      $$('#pills a, #rail a').forEach(function (a) {
        var i = SECCIONES.map(function (s) { return s[0]; }).indexOf(a.getAttribute('data-id'));
        a.classList.toggle('on', i === cur);
        a.classList.toggle('hecho', i < cur);
        if (a.parentNode.id !== 'pills' && i === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      var act = $('#rail a.on'), hilo = $('#hilo');
      if (act && hilo) hilo.style.height = Math.max(0, act.parentNode.offsetTop + 16 - 10) + 'px'; else if (hilo) hilo.style.height = '0px';
      var pa = $('#pills a.on'); if (pa && pa.scrollIntoView && window.innerWidth < 1260) { var p = $('#pills'); p.scrollLeft = pa.offsetLeft - 40; }
    }
    window.addEventListener('scroll', spy, { passive: true }); window.addEventListener('resize', spy); spy();
  }

  /* ================= portada: archivo que se escribe solo ================= */
  function buildHero() {
    var pre = $('#tipeo');
    var lines = ['# mosquitto.conf', 'listener 1883', 'allow_anonymous false', 'password_file /etc/mosquitto/passwd', 'persistence true'];
    function render(done, partial) {
      var html = '';
      for (var i = 0; i < done; i++) html += colorConf(lines[i]) + '\n';
      if (partial !== null && done < lines.length) html += colorConf(partial);
      pre.innerHTML = html + '<span class="cur"></span>';
    }
    if (reduceMotion) { render(lines.length, null); return; }
    var li = 0, ci = 0;
    render(0, '');
    function tick() {
      if (li >= lines.length) { render(lines.length, null); return; }
      ci++;
      if (ci > lines[li].length) { li++; ci = 0; render(li, ''); setTimeout(tick, 320); return; }
      render(li, lines[li].slice(0, ci));
      setTimeout(tick, 30);
    }
    setTimeout(tick, 600);
  }

  /* ================= estado del broker (barra superior) ================= */
  function buildStatus() {
    function upd() {
      var l = MQ.activeListeners(), n = MQ.clientCount();
      var sub = (l.length ? 'puertos ' + l.map(function (x) { return x.port; }).join(', ') : 'solo local') + ', ' + n + (n === 1 ? ' cliente' : ' clientes');
      $('#estado-sub').textContent = sub;
      $('#estado-txt').textContent = 'Broker en línea';
    }
    MQ.onChange(upd); upd();
  }

  /* ================= mapa (ruta de seis pasos) ================= */
  var PASOS = [
    { t: 'Instalar', h: 'Instalar el broker', p: 'Mosquitto es el broker de código abierto más usado en proyectos pequeños y de aula. Se instala en minutos en Linux, Windows o Docker y trae las dos herramientas de prueba: mosquitto_sub y mosquitto_pub.', code: ['sudo apt update', 'sudo apt install -y mosquitto mosquitto-clients', 'sudo systemctl enable --now mosquitto'], lang: 'sh', ir: 'broker', irt: 'Ver las tres formas de instalar' },
    { t: 'Abrir puertos', h: 'Abrir puertos con listeners', p: 'Un listener es un puerto donde el broker escucha. Sin ningún listener, Mosquitto 2 solo acepta conexiones desde el propio equipo. Los puertos habituales son 1883 (sin cifrar) y 8883 (con TLS); 9001 es el que se suele elegir para WebSockets.', code: ['listener 1883', '', 'listener 8883', 'certfile /etc/mosquitto/certs/servidor.crt', 'keyfile /etc/mosquitto/certs/servidor.key'], lang: 'conf', ir: 'broker', irt: 'Probar los puertos en el laboratorio 1' },
    { t: 'Proteger', h: 'Proteger el acceso', p: 'Hay tres capas y cada una frena un problema distinto: usuario y contraseña (password_file) para saber quién entra, permisos por topic (acl_file) para limitar qué hace, y TLS para que nadie lea el tráfico.', code: ['allow_anonymous false', 'password_file /etc/mosquitto/passwd', 'acl_file /etc/mosquitto/acl'], lang: 'conf', ir: 'permisos', irt: 'Crear usuarios y reglas' },
    { t: 'Recordar', h: 'Dar memoria al broker', p: 'Con persistence true el broker guarda en el disco los mensajes retenidos y las sesiones persistentes, y los recupera si se reinicia. Sin ella todo vive en memoria y desaparece.', code: ['persistence true', 'persistence_location /var/lib/mosquitto/', 'max_queued_messages 1000'], lang: 'conf', ir: 'broker', irt: 'Reiniciar el broker y ver qué sobrevive' },
    { t: 'Conectar', h: 'Configurar el cliente', p: 'Cada cliente manda un paquete CONNECT con su identificador único, usuario y contraseña, keep alive, sesión limpia o persistente y un testamento que el broker publicará si el cliente se cae sin avisar.', code: ['id: esp32-sensor01', 'keep alive: 60 segundos', 'sesión limpia: sí', 'testamento: estado = offline'], lang: 'sh', ir: 'cliente', irt: 'Conectar un dispositivo' },
    { t: 'Probar', h: 'Probar y diagnosticar', p: 'Dos terminales bastan: una escucha con mosquitto_sub y otra publica con mosquitto_pub. Si algo falla, el código de respuesta del CONNACK y el registro del broker dicen casi siempre la causa.', code: ["mosquitto_sub -h localhost -t 'invernadero/#' -v", 'mosquitto_pub -h localhost -t invernadero/sala1/temperatura -m 24.5'], lang: 'sh', ir: 'terminal', irt: 'Abrir las dos terminales' }
  ];
  function buildRuta() {
    var ruta = $('#ruta'), det = $('#ruta-det'), btns = [];
    function show(i) {
      btns.forEach(function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      var p = PASOS[i];
      det.innerHTML = '';
      var cb = codeBox('Ejemplo', p.lang); cb.set(p.code);
      var left = h('div', null, h('h3', { text: (i + 1) + '. ' + p.h }), h('p', { text: p.p }), h('a', { class: 'btn suave chico ir', href: '#' + p.ir, text: p.irt }));
      det.appendChild(left); det.appendChild(cb.el);
    }
    PASOS.forEach(function (p, i) {
      var b = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: function () { show(i); } }, h('span', { class: 'jack', text: String(i + 1) }), h('span', { text: p.t }));
      btns.push(b); ruta.appendChild(b);
    });
    show(0);
  }

  /* ================= laboratorio 1: broker ================= */
  var INSTALAR = {
    ubuntu: { t: 'Ubuntu o Debian', lang: 'sh', lines: ['# Instalar el broker y las herramientas de prueba', 'sudo apt update', 'sudo apt install -y mosquitto mosquitto-clients', '', '# Archivo de configuración: /etc/mosquitto/mosquitto.conf', '# Tus ajustes pueden ir en /etc/mosquitto/conf.d/mi-config.conf', '', '# Aplicar cambios y ver el registro', 'sudo systemctl restart mosquitto', 'sudo journalctl -u mosquitto -f'] },
    windows: { t: 'Windows', lang: 'sh', lines: ['# 1. Descarga el instalador de Eclipse Mosquitto desde mosquitto.org (descargas)', '# 2. Ejecútalo: instala el servicio "Mosquitto Broker"', '# 3. Edita C:\\Program Files\\mosquitto\\mosquitto.conf', '', '# Ejecutar a mano para ver el registro en pantalla (-v = verboso)', 'mosquitto -c "C:\\Program Files\\mosquitto\\mosquitto.conf" -v', '', '# Recuerda abrir el puerto 1883 en el Firewall de Windows', '# si otros equipos van a conectarse'] },
    docker: { t: 'Docker', lang: 'sh', lines: ['# Con tu mosquitto.conf en la carpeta actual', 'docker run -d --name mosquitto \\', '  -p 1883:1883 \\', '  -v "$(pwd)/mosquitto.conf:/mosquitto/config/mosquitto.conf" \\', '  eclipse-mosquitto', '', '# Ver el registro', 'docker logs -f mosquitto'] }
  };
  var brokerCtl = {};
  function buildInstalar() {
    var host = $('#lab-instalar'); host.className = 'hint-wrap';
    var shell = labShell('Instalación', 'Elige tu sistema');
    shell.body.className = 'lab-cuerpo';
    var cb = codeBox('Terminal', 'sh');
    var keys = ['ubuntu', 'windows', 'docker'];
    var tb = tabsBar(keys.map(function (k) { return [k, INSTALAR[k].t]; }), function (k) { cb.title(INSTALAR[k].t); cb.set(INSTALAR[k].lines); }, 'claras');
    shell.body.appendChild(h('div', null, tb.el, cb.el));
    host.appendChild(shell.el);
    tb.pick(0);
  }

  function buildBroker() {
    var host = $('#lab-broker');
    var shell = labShell('Panel del broker', 'Cada interruptor cambia una línea del archivo', 'dos');
    var c = S.cfg;
    var left = h('div'), right = h('div');
    shell.body.appendChild(left); shell.body.appendChild(right);

    var presetBox = h('div', { class: 'chips' });
    [['abierto', 'Laboratorio abierto'], ['aula', 'Aula segura'], ['produccion', 'Producción']].forEach(function (p) {
      presetBox.appendChild(h('button', { type: 'button', class: 'chip', text: p[1], onclick: function () { MQ.applyPreset(p[0]); } }));
    });
    left.appendChild(grupo('Partir de una plantilla', 'Tres configuraciones típicas para comparar. Luego ajusta lo que quieras.', presetBox));

    var k = brokerCtl;
    k.tcpOn = sw('Puerto MQTT sin cifrar', 'El estándar es 1883. Lo usan casi todos los ejemplos.', function (v) { S.cfg.tcp.on = v; MQ.emit(); });
    k.tcpPort = numField('Puerto', function () { return S.cfg.tcp.port; }, 1, 65535, function (v) { S.cfg.tcp.port = v; MQ.emit(); }, 'corto');
    k.tcpLocal = sw('Solo este equipo', 'Añade 127.0.0.1 al listener: nadie más en la red puede entrar.', function (v) { S.cfg.tcp.local = v; MQ.emit(); });
    k.tlsOn = sw('Puerto MQTT con TLS', 'El estándar es 8883. Necesita certificados.', function (v) { S.cfg.tls.on = v; MQ.emit(); });
    k.tlsPort = numField('Puerto', function () { return S.cfg.tls.port; }, 1, 65535, function (v) { S.cfg.tls.port = v; MQ.emit(); }, 'corto');
    k.wsOn = sw('Puerto WebSockets', 'Para páginas web que hablan MQTT. Se suele usar 9001.', function (v) { S.cfg.ws.on = v; MQ.emit(); });
    k.wsPort = numField('Puerto', function () { return S.cfg.ws.port; }, 1, 65535, function (v) { S.cfg.ws.port = v; MQ.emit(); }, 'corto');
    left.appendChild(grupo('Puertos (listeners)', 'Cada puerto activado agrega un bloque listener al archivo.',
      k.tcpOn.el, h('div', { class: 'fila' }, k.tcpPort.el), k.tcpLocal.el,
      k.tlsOn.el, h('div', { class: 'fila' }, k.tlsPort.el),
      k.wsOn.el, h('div', { class: 'fila' }, k.wsPort.el)));

    k.auth = sw('Exigir usuario y contraseña', 'Pone allow_anonymous en false y agrega password_file.', function (v) { S.cfg.auth = v; MQ.emit(); });
    k.acl = sw('Limitar con una ACL', 'Agrega acl_file: qué topics puede leer y escribir cada quien.', function (v) { S.cfg.acl = v; MQ.emit(); });
    left.appendChild(grupo('Acceso', null, k.auth.el, k.acl.el));

    k.persist = sw('Guardar en disco (persistence)', 'Retenidos y sesiones sobreviven a un reinicio.', function (v) { S.cfg.persist = v; MQ.emit(); });
    k.queued = numField('Cola por cliente', function () { return S.cfg.maxQueued; }, 0, 100000, function (v) { S.cfg.maxQueued = v; MQ.emit(); }, 'corto');
    k.maxc = numField('Máx. conexiones', function () { return S.cfg.maxConn; }, -1, 100000, function (v) { S.cfg.maxConn = v; MQ.emit(); }, 'corto');
    left.appendChild(grupo('Memoria y límites', '-1 en conexiones significa sin límite.', k.persist.el, h('div', { class: 'fila' }, k.queued.el, k.maxc.el)));

    var lg = logBox();
    left.appendChild(grupo('Reiniciar el broker', 'Desconecta a todos los clientes y aplica la persistencia: con ella se conservan los retenidos y las sesiones; sin ella se pierden.',
      h('button', { type: 'button', class: 'btn oro chico', text: 'Reiniciar broker', onclick: function () { MQ.restart(); } })));
    left.appendChild(h('div', { style: 'margin-top:14px' }, lg.el));

    /* lado derecho */
    var meterT = h('span', { class: 't1' }), meterV = h('span', { class: 't2' });
    var meterFill = h('i');
    var medidor = h('div', { class: 'medidor' }, h('div', { class: 't' }, meterT, meterV), h('div', { class: 'barra-m' }, meterFill));
    var alcance = h('div', { class: 'grupo' });
    var cbox = codeBox('mosquitto.conf', 'conf');
    var explica = h('ul', { class: 'explica' });
    var checks = h('div', { class: 'grupo' });
    right.appendChild(medidor); right.appendChild(alcance); right.appendChild(cbox.el); right.appendChild(explica); right.appendChild(checks);
    k.render = function () {
      var sc = MQ.score();
      meterT.textContent = 'Seguridad del broker'; meterV.textContent = sc.label + ', ' + sc.value + ' de 100';
      meterFill.style.width = sc.value + '%';
      meterFill.style.background = sc.value < 25 ? 'var(--error)' : sc.value < 55 ? 'var(--alerta)' : sc.value < 85 ? 'var(--oro)' : 'var(--senal)';
      alcance.innerHTML = ''; alcance.appendChild(h('h4', { text: 'Quién puede conectarse con esta configuración' }));
      var ch = h('div', { class: 'chips', style: 'margin-top:8px' });
      MQ.alcance().forEach(function (a) { ch.appendChild(h('span', { class: 'chip ' + (a.ok ? 'on' : ''), title: a.d, text: (a.ok ? 'Sí: ' : 'No: ') + a.t })); });
      alcance.appendChild(ch);
      var lines = MQ.confLines();
      cbox.set(lines);
      explica.innerHTML = '';
      lines.forEach(function (l, i) {
        if (l.type !== 'd') return;
        var li = h('li', { tabindex: '0' }, h('b', { text: l.txt }), h('span', { text: l.es }));
        function on() { var ln = $('.ln[data-i="' + i + '"]', cbox.el); if (ln) ln.classList.add('hl'); li.classList.add('hl'); }
        function off() { var ln = $('.ln[data-i="' + i + '"]', cbox.el); if (ln) ln.classList.remove('hl'); li.classList.remove('hl'); }
        li.addEventListener('mouseenter', on); li.addEventListener('mouseleave', off); li.addEventListener('focus', on); li.addEventListener('blur', off);
        explica.appendChild(li);
      });
      checks.innerHTML = ''; checks.appendChild(h('h4', { text: 'Revisión automática' }));
      MQ.checks().forEach(function (x) {
        var sym = x.level === 'ok' ? '✓' : x.level === 'warn' ? '!' : x.level === 'bad' ? '×' : 'i';
        checks.appendChild(h('div', { class: 'chk ' + x.level }, h('span', { class: 'ic', text: sym }), h('div', null, h('b', { text: x.title }), h('span', { text: x.txt }))));
      });
      var cc = S.cfg;
      k.tcpOn.inp.checked = cc.tcp.on; k.tcpPort.sync(); k.tcpPort.inp.disabled = !cc.tcp.on; k.tcpLocal.inp.checked = cc.tcp.local; k.tcpLocal.inp.disabled = !cc.tcp.on;
      k.tlsOn.inp.checked = cc.tls.on; k.tlsPort.sync(); k.tlsPort.inp.disabled = !cc.tls.on;
      k.wsOn.inp.checked = cc.ws.on; k.wsPort.sync(); k.wsPort.inp.disabled = !cc.ws.on;
      k.auth.inp.checked = cc.auth; k.acl.inp.checked = cc.acl; k.persist.inp.checked = cc.persist; k.queued.sync(); k.maxc.sync();
    };
    host.appendChild(shell.el);
    MQ.onChange(k.render); k.render();
  }

  /* ================= laboratorio 2: usuarios y permisos ================= */
  var permCtl = {};
  function quien(who) { return who === '@anon' ? 'Anónimo' : who === '*' ? 'Todos (pattern)' : who; }
  function permEtq(p) {
    var t = p === 'read' ? 'leer' : p === 'write' ? 'escribir' : p === 'readwrite' ? 'leer y escribir' : 'denegar';
    return h('span', { class: 'etq ' + (p === 'read' ? 'leer' : p === 'write' ? 'escribir' : p === 'readwrite' ? 'rw' : 'deny'), text: t });
  }
  function validFilter(f) {
    if (!f) return false;
    var p = f.split('/');
    for (var i = 0; i < p.length; i++) {
      if (p[i] === '#' && i !== p.length - 1) return false;
      if (p[i].indexOf('#') >= 0 && p[i] !== '#') return false;
      if (p[i].indexOf('+') >= 0 && p[i] !== '+') return false;
    }
    return !/\s/.test(f);
  }
  function buildPermisos() {
    var host = $('#lab-permisos');
    var shell = labShell('Usuarios, reglas y probador', 'Todo lo que cambies se aplica al broker simulado', 'dos-iguales');
    var left = h('div'), right = h('div');
    shell.body.appendChild(left); shell.body.appendChild(right);
    var k = permCtl;

    /* usuarios */
    var uBody = h('tbody'), uTable = h('table', { class: 'tabla' }, h('thead', null, h('tr', null, h('th', { text: 'Usuario' }), h('th', { text: 'Contraseña' }), h('th', null, h('span', { class: 'sr', text: 'Quitar' })))), uBody);
    var uName = textField('Nuevo usuario', '', function () {}, 'corto'), uPass = textField('Contraseña', '', function () {}, 'corto');
    var uMsg = h('p', { class: 'peq', style: 'margin-top:8px;min-height:1.2em' });
    var uAdd = h('button', { type: 'button', class: 'btn chico', text: 'Agregar usuario', onclick: function () {
      var n = uName.inp.value.trim(), p = uPass.inp.value;
      if (!n || !p) { uMsg.textContent = 'Escribe un nombre y una contraseña.'; return; }
      if (/[\s:]/.test(n)) { uMsg.textContent = 'El nombre no puede llevar espacios ni dos puntos.'; return; }
      if (S.users.some(function (u) { return u.name === n; })) { uMsg.textContent = 'Ese usuario ya existe.'; return; }
      S.users.push({ name: n, pass: p }); uName.inp.value = ''; uPass.inp.value = ''; uMsg.textContent = 'Usuario agregado.'; MQ.emit();
    } });
    left.appendChild(grupo('Usuarios (archivo passwd)', 'Se crean con mosquitto_passwd. Aquí las contraseñas se ven para que puedas probar; en el archivo real quedan cifradas.', uTable, h('div', { class: 'fila' }, uName.el, uPass.el, uAdd), uMsg));

    /* reglas */
    var rBody = h('tbody'), rTable = h('table', { class: 'tabla' }, h('thead', null, h('tr', null, h('th', { text: 'Para' }), h('th', { text: 'Permiso' }), h('th', { text: 'Topic' }), h('th', null, h('span', { class: 'sr', text: 'Quitar' })))), rBody);
    k.rWho = selectField('Para', [], '@anon', function () {}, 'corto');
    var rPerm = selectField('Permiso', [['read', 'leer'], ['write', 'escribir'], ['readwrite', 'leer y escribir'], ['deny', 'denegar']], 'read', function () {}, 'corto');
    var rTopic = textField('Topic o filtro', 'invernadero/sala2/#', function () {}, 'largo');
    var rMsg = h('p', { class: 'peq', style: 'margin-top:8px;min-height:1.2em' });
    var rAdd = h('button', { type: 'button', class: 'btn chico', text: 'Agregar regla', onclick: function () {
      var t = rTopic.inp.value.trim();
      if (!validFilter(t)) { rMsg.textContent = 'Topic no válido: sin espacios, y + o # solo ocupando un nivel completo (# al final).'; return; }
      S.rules.push({ who: k.rWho.sel.value, perm: rPerm.sel.value, topic: t }); rMsg.textContent = 'Regla agregada.'; MQ.emit();
    } });
    left.appendChild(grupo('Reglas de la ACL (archivo acl)', 'Sin regla que coincida, la respuesta es no. Las reglas "denegar" se revisan primero. Usa %u en un pattern para el nombre de usuario.', rTable, h('div', { class: 'fila' }, k.rWho.el, rPerm.el, rTopic.el, rAdd), rMsg));

    /* probador */
    k.pUser = selectField('Quién', [], '', function () { probe(); }, 'corto');
    var pAct = selectField('Acción', [['write', 'Publicar en'], ['read', 'Suscribirse a']], 'write', function () { probe(); }, 'corto');
    var pTopic = textField('Topic', 'invernadero/sala1/temperatura', function () { probe(); }, 'largo');
    var ver = h('div', { 'aria-live': 'polite' });
    var ej = h('div', { class: 'chips', style: 'margin-top:12px' });
    [['sensor1', 'write', 'invernadero/sala1/temperatura', 'sensor1 publica en sala1'], ['sensor1', 'write', 'invernadero/sala2/temperatura', 'sensor1 publica en sala2'], ['panel', 'read', 'invernadero/#', 'panel lee todo el invernadero'], ['panel', 'write', 'clientes/panel/estado', 'panel escribe en su carpeta'], ['@anon', 'read', 'publico/avisos', 'anónimo lee publico']].forEach(function (e) {
      ej.appendChild(h('button', { type: 'button', class: 'chip', text: e[3], onclick: function () { k.pUser.sel.value = e[0]; pAct.sel.value = e[1]; pTopic.inp.value = e[2]; probe(); } }));
    });
    var aclHint = h('div');
    right.appendChild(grupo('Probador de permisos', 'Elige quién actúa y qué intenta hacer. Verás la respuesta del broker y la regla que decidió.', aclHint, h('div', { class: 'fila' }, k.pUser.el, pAct.el, pTopic.el), ver, ej));
    var passBox = codeBox('Comandos para el archivo passwd', 'sh'), aclBox = codeBox('Archivo acl generado', 'conf');
    right.appendChild(h('div', { class: 'grupo' }, passBox.el));
    right.appendChild(h('div', { class: 'grupo' }, aclBox.el));

    function probe() {
      var u = k.pUser.sel.value, user = u === '@anon' || u === '' ? null : u, acc = pAct.sel.value, topic = pTopic.inp.value.trim();
      ver.innerHTML = '';
      function vd(cls, sym, b, s) { ver.appendChild(h('div', { class: 'veredicto ' + cls }, h('span', { class: 'ic', text: sym }), h('div', null, h('b', { text: b }), h('span', { text: s })))); }
      if (!topic) { vd('neutro', 'i', 'Escribe un topic', 'Por ejemplo invernadero/sala1/temperatura.'); return; }
      if (acc === 'write' && /[+#]/.test(topic)) { vd('no', '×', 'No es un topic de publicación válido', 'Al publicar no se pueden usar los comodines + ni #. Esos son solo para filtros de suscripción.'); return; }
      if (acc === 'read' && !validFilter(topic)) { vd('no', '×', 'No es un filtro válido', '# solo va al final y + o # deben ocupar un nivel completo.'); return; }
      var r = MQ.acl(user, 'dispositivo-01', topic, acc, false);
      var who = user ? 'El usuario ' + user : 'Un cliente anónimo';
      var extra = (user && !S.cfg.auth) ? ' Nota: el broker no pide contraseña, pero el nombre de usuario que manda el cliente igual se usa para aplicar la ACL.' : '';
      if (r.ok) vd('ok', '✓', who + (acc === 'write' ? ' puede publicar' : ' puede suscribirse') + ' en ' + topic, r.why + extra);
      else vd('no', '×', who + (acc === 'write' ? ' no puede publicar' : ' no puede suscribirse') + ' en ' + topic, r.why + extra);
    }
    k.probe = probe;

    k.render = function () {
      uBody.innerHTML = '';
      if (!S.users.length) uBody.appendChild(h('tr', null, h('td', { colspan: '3', text: 'Sin usuarios. Agrega uno para poder exigir contraseña.' })));
      S.users.forEach(function (u, i) {
        uBody.appendChild(h('tr', null, h('td', { class: 'm', text: u.name }), h('td', { class: 'm', text: u.pass }), h('td', null, h('button', { type: 'button', class: 'x', 'aria-label': 'Quitar usuario ' + u.name, text: '×', onclick: function () {
          S.users.splice(i, 1); S.rules = S.rules.filter(function (r) { return r.who !== u.name; }); MQ.emit();
        } }))));
      });
      rBody.innerHTML = '';
      if (!S.rules.length) rBody.appendChild(h('tr', null, h('td', { colspan: '4', text: 'Sin reglas: con la ACL activa, nadie puede nada.' })));
      S.rules.forEach(function (r, i) {
        rBody.appendChild(h('tr', null, h('td', { text: quien(r.who) }), h('td', null, permEtq(r.perm)), h('td', { class: 'm', text: r.topic }), h('td', null, h('button', { type: 'button', class: 'x', 'aria-label': 'Quitar regla', text: '×', onclick: function () { S.rules.splice(i, 1); MQ.emit(); } }))));
      });
      function fillSel(sel, opts, keep) {
        var cur = sel.value; sel.innerHTML = '';
        opts.forEach(function (o) { sel.appendChild(h('option', { value: o[0], text: o[1] })); });
        sel.value = opts.some(function (o) { return o[0] === cur; }) ? cur : keep;
      }
      var who = [['@anon', 'Anónimo']].concat(S.users.map(function (u) { return [u.name, u.name]; }));
      fillSel(k.pUser.sel, who, who[0][0]);
      fillSel(k.rWho.sel, who.concat([['*', 'Todos (pattern)']]), '@anon');
      passBox.set(MQ.passwdText().split('\n').slice(0, -1));
      aclBox.set(MQ.aclText().split('\n').slice(0, -1));
      aclHint.innerHTML = '';
      if (!S.cfg.acl) aclHint.appendChild(h('div', { class: 'hint' }, h('div', null, h('b', { text: 'La ACL está apagada. ' }), 'Mientras no haya acl_file, todos pueden leer y escribir en cualquier topic. ', h('button', { type: 'button', class: 'btn chico oro', style: 'margin-left:6px', text: 'Activar la ACL', onclick: function () { S.cfg.acl = true; MQ.emit(); } }))));
      probe();
    };
    host.appendChild(shell.el);
    MQ.onChange(k.render); k.render();
  }

  /* ================= laboratorio 3: cliente ================= */
  var C = { transport: 'tcp', port: 1883, origin: 'remote', id: 'esp32-sensor01', user: '', pass: '', keepalive: 60, clean: true,
    willOn: false, willTopic: 'invernadero/sala1/estado', willPayload: 'offline', willQos: 1, willRetain: true,
    subTopic: 'invernadero/#', subQos: 0, pubTopic: 'invernadero/sala1/temperatura', pubPayload: '24.5', pubQos: 0, pubRetain: false, host: '192.168.1.50' };
  var cCbs = [];
  function cChanged() { cCbs.forEach(function (f) { f(); }); }
  var dev = null, panel = null, panelManual = false, deadlineTimer = null;
  var cl = {};
  var DEFPORT = { tcp: function () { return S.cfg.tcp.port || 1883; }, tls: function () { return S.cfg.tls.port || 8883; }, ws: function () { return S.cfg.ws.port || 9001; } };
  var TNAME = { tcp: 'TCP sin cifrar', tls: 'TCP con TLS', ws: 'WebSocket' };

  function feedAdd(ul, m, extra) {
    var first = ul.firstChild; if (first && first.className === 'vacio') ul.innerHTML = '';
    var li = h('li', null, h('span', { class: 'tp', text: m.topic }), h('span', { class: 'pl', text: m.payload === '' ? '(mensaje vacío)' : m.payload }), h('span', { class: 'tag q', text: 'QoS ' + m.qos }));
    if (m.retain) li.appendChild(h('span', { class: 'tag ret', text: 'retenido' }));
    if (m.will) li.appendChild(h('span', { class: 'tag will', text: 'testamento' }));
    if (extra) li.appendChild(h('span', { class: 'tag', text: extra }));
    ul.appendChild(li); while (ul.children.length > 40) ul.removeChild(ul.firstChild);
    ul.scrollTop = ul.scrollHeight;
  }
  function feedEmpty(ul, t) { ul.innerHTML = ''; ul.appendChild(h('li', { class: 'vacio', text: t })); }

  function flyPkt(from, to, label, cls) {
    return new Promise(function (res) {
      var area = cl.nodos; if (!area || reduceMotion) { res(); return; }
      var ar = area.getBoundingClientRect();
      function cx(i) { var r = cl.nodeEls[i].getBoundingClientRect(); return r.left + r.width / 2 - ar.left; }
      var p = h('span', { class: 'pkt ' + (cls || ''), text: label });
      area.appendChild(p);
      var w = p.offsetWidth, x0 = cx(from) - w / 2, x1 = cx(to) - w / 2;
      p.style.left = x0 + 'px';
      var dur = 650;
      try {
        var a = p.animate([{ left: x0 + 'px' }, { left: x1 + 'px' }], { duration: dur, easing: 'ease-in-out', fill: 'forwards' });
        a.onfinish = function () { p.remove(); res(); };
      } catch (e) { p.remove(); res(); }
    });
  }

  function connectPanel() {
    panelManual = false;
    var port = (MQ.activeListeners()[0] || { port: 1883 }).port;
    var r = MQ.connect({ internal: true, admin: true, transport: 'tcp', port: port, origin: 'local', id: 'panel-docente', user: '', pass: '', keepalive: 60, clean: true, label: 'Panel',
      onMessage: function (m) { feedAdd(cl.panelFeed, m); flyPkt(1, 2, m.will ? 'WILL' : 'PUBLISH', m.will ? 'will' : 'pub'); },
      onClosed: function (why) { panel = null; if (!panelManual) setTimeout(function () { if (!panel) connectPanel(); }, 500); } });
    if (r.ok) { panel = r.client; MQ.subscribe(panel, '#', 1); }
  }

  function setNodes() {
    if (!cl.nodeEls) return;
    var n0 = cl.nodeEls[0], on = dev && dev.alive;
    n0.classList.toggle('activo', !!on && !dev.silent);
    n0.classList.toggle('roto', !!(on && dev.silent));
    cl.nodeTitle.textContent = C.id || '(sin ID)';
    cl.nodeSub.textContent = on ? (dev.silent ? 'sin señal: cable cortado' : 'conectado, keep alive ' + dev.keepalive + ' s') : 'sin conexión';
    cl.cable.classList.toggle('cortado', !!(on && dev.silent));
    cl.nodeEls[1].querySelector('small').textContent = MQ.activeListeners().length ? 'escucha ' + MQ.activeListeners().map(function (x) { return x.port; }).join(', ') : 'solo local';
    cl.nodeEls[2].classList.toggle('activo', !!panel);
    cl.nodeEls[2].querySelector('small').textContent = panel ? 'conectado, escucha #' : 'reconectando';
    var connected = !!on;
    cl.btnConn.disabled = connected || cl.busy; cl.btnDis.disabled = !connected; cl.btnCut.disabled = !connected || dev.silent;
    [cl.subBtn, cl.pubBtn].forEach(function (b) { b.disabled = !connected || dev.silent; });
    cl.cableNote.hidden = true;
  }

  function showResult(ok, b, s) {
    var r = cl.result; r.className = 'resultado ver ' + (ok ? 'ok' : 'no'); r.innerHTML = '';
    r.appendChild(h('b', { text: b })); r.appendChild(h('span', { text: s }));
  }
  function stopDeadline() { if (deadlineTimer) { clearInterval(deadlineTimer); deadlineTimer = null; } cl.plazo.innerHTML = ''; }

  function devClosed(why) {
    var was = dev; dev = null; stopDeadline();
    if (why === 'takeover') showResult(false, 'Otro cliente usó tu mismo ID', 'El broker te expulsó para dejar entrar al nuevo. Si tu dispositivo reconecta solo, se expulsarán en bucle. Cada cliente necesita un ID único.');
    if (why === 'restart') showResult(false, 'El broker se reinició', 'Se cortaron todas las conexiones. Un cliente bien hecho reconecta solo.');
    if (why === 'timeout') showResult(false, 'El broker te dio por muerto', 'No llegó ningún paquete en 1,5 veces el keep alive. Si definiste un testamento, ya se publicó en el panel.');
    setNodes();
  }
  function devMsg(m) { feedAdd(cl.devFeed, m); flyPkt(1, 0, 'PUBLISH', 'pub'); }

  function buildReq() {
    return { transport: C.transport, port: C.port, origin: C.origin, id: (C.id || '').trim(), user: C.user, pass: C.pass, keepalive: C.keepalive, clean: C.clean,
      will: C.willOn ? { topic: C.willTopic, payload: C.willPayload, qos: C.willQos, retain: C.willRetain } : null, onMessage: devMsg, onClosed: devClosed, label: C.id };
  }
  function doConnect() {
    if (dev && dev.alive) return Promise.resolve();
    if (C.willOn && !C.willTopic.trim()) { showResult(false, 'Falta el topic del testamento', 'Escribe el topic donde el broker avisará, por ejemplo invernadero/sala1/estado.'); return Promise.resolve(); }
    cl.busy = true; setNodes(); cl.result.className = 'resultado';
    var req = buildReq();
    return flyPkt(0, 1, req.transport === 'tcp' ? 'CONNECT' : req.transport === 'tls' ? 'TLS + CONNECT' : 'WS + CONNECT', '').then(function () {
      var r = MQ.connect(req);
      if (r.ok) {
        dev = r.client;
        return flyPkt(1, 0, 'CONNACK 0', 'ack').then(function () {
          cl.busy = false; setNodes();
          showResult(true, 'Conectado: CONNACK 0', r.sessionPresent ? 'Session present: sí. El broker encontró una sesión guardada con este ID y la reanudó (suscripciones y mensajes pendientes).' : 'Session present: no. Es una sesión nueva' + (C.clean ? ' y se borrará al desconectarse.' : ' y el broker la guardará al desconectarse.'));
        });
      }
      var lab = r.stage === 'connack' ? 'CONNACK ' + r.code : (r.stage === 'tls' ? 'TLS alert' : 'RST');
      return flyPkt(1, 0, lab, 'err').then(function () {
        cl.busy = false; setNodes();
        showResult(false, r.stage === 'connack' ? 'Rechazado: ' + r.text : 'Sin conexión: ' + r.text, r.es);
      });
    });
  }
  function doDisconnect() {
    if (!dev) return;
    var d = dev;
    flyPkt(0, 1, 'DISCONNECT', '').then(function () {
      MQ.disconnect(d);
      showResult(true, 'Desconectado con DISCONNECT', C.willOn ? 'Al despedirte con DISCONNECT, el broker descarta el testamento. No se publicó nada en el panel.' : 'Salida limpia. ' + (C.clean ? 'La sesión se borró.' : 'La sesión quedó guardada en el broker.'));
    });
  }
  function doCut() {
    if (!dev || dev.silent) return;
    var d = dev; MQ.cut(d); setNodes();
    var ka = d.keepalive;
    if (!ka) {
      showResult(false, 'Cable cortado, pero keep alive es 0', 'Con keep alive desactivado el broker nunca nota que el cliente murió, hasta que el sistema operativo cierre el socket. Por eso conviene usar un valor mayor que 0.');
      cl.plazo.innerHTML = ''; cl.plazo.appendChild(h('span', { text: 'Sin plazo: keep alive en 0. Pulsa Desconectar para limpiar.' }));
      cl.btnDis.disabled = false; return;
    }
    var limite = ka * 1.5, t = 0;
    var barra = h('i'), txt = h('span');
    cl.plazo.innerHTML = ''; cl.plazo.appendChild(txt); cl.plazo.appendChild(h('div', { class: 'barra-m' }, barra));
    showResult(false, 'Cable cortado sin DISCONNECT', 'Mira la barra: el broker espera 1,5 veces el keep alive (' + limite + ' s) antes de declararlo muerto. La simulación corre 10 veces más rápido.');
    function paint() { txt.textContent = 'Sin noticias del dispositivo: ' + Math.min(t, limite).toFixed(0) + ' de ' + limite + ' segundos simulados'; barra.style.width = Math.min(100, t / limite * 100) + '%'; }
    paint();
    deadlineTimer = setInterval(function () {
      t += 1; paint();
      if (t >= limite) { clearInterval(deadlineTimer); deadlineTimer = null; MQ.expire(d); }
    }, reduceMotion ? 20 : 100);
  }
  function doSubscribe() {
    if (!dev) return;
    var f = C.subTopic.trim();
    if (!validFilter(f)) { cl.subMsg.textContent = 'Filtro no válido: # solo va al final y + o # ocupan un nivel completo.'; return; }
    flyPkt(0, 1, 'SUBSCRIBE', '').then(function () {
      var r = MQ.subscribe(dev, f, C.subQos);
      return flyPkt(1, 0, 'SUBACK', r.ok ? 'ack' : 'err').then(function () {
        cl.subMsg.textContent = r.ok ? 'Suscrito a ' + f + ' con QoS ' + C.subQos + '. Si había mensajes retenidos, ya llegaron.' : 'SUBACK 0x80: el broker rechazó la suscripción. ' + r.why;
      });
    });
  }
  function doPublish() {
    if (!dev) return;
    var t = C.pubTopic.trim();
    if (!t || /[+#\s]/.test(t)) { cl.pubMsg.textContent = 'El topic de publicación no puede llevar espacios, + ni #.'; return; }
    flyPkt(0, 1, 'PUBLISH QoS ' + C.pubQos, 'pub').then(function () {
      var r = MQ.publish(dev, t, C.pubPayload, C.pubQos, C.pubRetain);
      var p = C.pubQos >= 1 ? flyPkt(1, 0, 'PUBACK', 'ack') : Promise.resolve();
      return p.then(function () {
        if (r.ok) cl.pubMsg.textContent = 'Publicado en ' + t + (C.pubRetain ? ' como retenido' : '') + '. Lo recibieron ' + r.delivered + ' suscriptor(es).';
        else cl.pubMsg.textContent = 'El broker descartó el mensaje por la ACL.' + (C.pubQos >= 1 ? ' Aun así el cliente recibió PUBACK: con MQTT 3.1.1 no hay forma de enterarse.' : ' El cliente no recibe ningún error.');
      });
    });
  }

  function buildCliente() {
    var host = $('#lab-cliente');
    var shell = labShell('Formulario CONNECT y escenario', 'Tu dispositivo a la izquierda, el broker al centro y un panel de monitoreo a la derecha', 'dos');
    var left = h('div'), right = h('div');
    shell.body.appendChild(left); shell.body.appendChild(right);

    /* destino */
    var segT = segmented('transporte', [['tcp', 'TCP'], ['tls', 'TCP con TLS'], ['ws', 'WebSocket']], C.transport, function (v) { C.transport = v; C.port = DEFPORT[v](); portF.sync(); cChanged(); });
    var portF = numField('Puerto', function () { return C.port; }, 1, 65535, function (v) { C.port = v; cChanged(); }, 'corto');
    var segO = segmented('origen', [['remote', 'Otro equipo de la red'], ['local', 'Este mismo equipo']], C.origin, function (v) { C.origin = v; cChanged(); });
    left.appendChild(grupo('Destino', 'El puerto debe coincidir con un listener del broker y con su tipo.',
      h('div', { class: 'et', style: 'font-family:var(--f-titulo);font-weight:600;font-size:.82rem;color:var(--tinta-2);margin-bottom:5px', text: 'Transporte' }), segT.el,
      h('div', { class: 'fila' }, portF.el), h('div', { class: 'et', style: 'font-family:var(--f-titulo);font-weight:600;font-size:.82rem;color:var(--tinta-2);margin:12px 0 5px', text: 'El cliente corre en' }), segO.el));
    cl.setPort = function () { portF.sync(); segT.set(C.transport); segO.set(C.origin); };

    /* identidad */
    var idF = textField('ID del cliente (único)', C.id, function (v) { C.id = v; cChanged(); }, 'largo');
    var gen = h('button', { type: 'button', class: 'btn suave chico', text: 'Generar', onclick: function () { C.id = 'esp32-' + MQ.rnd(6); idF.inp.value = C.id; cChanged(); } });
    var uF = textField('Usuario', C.user, function (v) { C.user = v; cChanged(); }, 'corto');
    var pF = textField('Contraseña', C.pass, function (v) { C.pass = v; cChanged(); }, 'corto', 'password');
    var showPw = h('button', { type: 'button', class: 'btn suave chico', text: 'Ver', onclick: function () { var t = pF.inp.type === 'password'; pF.inp.type = t ? 'text' : 'password'; showPw.textContent = t ? 'Ocultar' : 'Ver'; } });
    left.appendChild(grupo('Identidad', 'Si el broker exige contraseña, estos datos deben estar en el archivo passwd del laboratorio 2. Prueba con sensor1 y clave123.',
      h('div', { class: 'fila' }, idF.el, gen), h('div', { class: 'fila' }, uF.el, pF.el, showPw)));
    cl.setIdent = function () { idF.inp.value = C.id; uF.inp.value = C.user; pF.inp.value = C.pass; };

    /* comportamiento */
    var kaOut = h('output', { text: C.keepalive + ' s' });
    var kaIn = h('input', { type: 'range', min: '0', max: '120', step: '5', 'aria-label': 'Keep alive en segundos' }); kaIn.value = C.keepalive;
    var kaHelp = h('p', { class: 'peq', style: 'margin-top:6px' });
    function kaTxt() { kaOut.textContent = C.keepalive === 0 ? 'desactivado' : C.keepalive + ' s'; kaHelp.textContent = C.keepalive === 0 ? 'Sin keep alive el broker no se entera de las caídas silenciosas.' : 'El cliente debe enviar algo (aunque sea un PINGREQ) al menos cada ' + C.keepalive + ' s. El broker lo da por caído tras ' + (C.keepalive * 1.5) + ' s de silencio.'; }
    kaIn.addEventListener('input', function () { C.keepalive = parseInt(kaIn.value, 10); kaTxt(); cChanged(); }); kaTxt();
    var cleanSw = sw('Sesión limpia (clean session)', 'Activada: el broker olvida al cliente al desconectarse. Desactivada: guarda sus suscripciones y los mensajes QoS 1 y 2 que lleguen mientras no está.', function (v) { C.clean = v; cChanged(); });
    cleanSw.inp.checked = C.clean;
    left.appendChild(grupo('Comportamiento', null, h('div', { class: 'campo' }, h('label', { text: 'Keep alive' }), h('div', { class: 'rango' }, kaIn, kaOut)), kaHelp, cleanSw.el));

    /* testamento */
    var wSw = sw('Dejar un testamento (Last Will)', 'Mensaje que el broker publica si el cliente se cae sin despedirse.', function (v) { C.willOn = v; wBox.hidden = !v; cChanged(); });
    var wT = textField('Topic del testamento', C.willTopic, function (v) { C.willTopic = v; cChanged(); }, 'largo');
    var wP = textField('Mensaje', C.willPayload, function (v) { C.willPayload = v; cChanged(); }, 'corto');
    var wQ = selectField('QoS', [['0', '0'], ['1', '1'], ['2', '2']], String(C.willQos), function (v) { C.willQos = parseInt(v, 10); cChanged(); }, 'corto');
    var wR = sw('Retenido', 'Quien llegue tarde ve el estado.', function (v) { C.willRetain = v; cChanged(); }); wR.inp.checked = C.willRetain;
    var wBox = h('div', null, h('div', { class: 'fila' }, wT.el), h('div', { class: 'fila' }, wP.el, wQ.el), wR.el); wBox.hidden = true;
    left.appendChild(grupo('Testamento', null, wSw.el, wBox));

    cl.btnConn = h('button', { type: 'button', class: 'btn', text: 'Conectar', onclick: doConnect });
    cl.btnDis = h('button', { type: 'button', class: 'btn sec', text: 'Desconectar (DISCONNECT)', onclick: doDisconnect });
    cl.btnCut = h('button', { type: 'button', class: 'btn peligro', text: 'Cortar el cable', onclick: doCut });
    left.appendChild(h('div', { class: 'fila', style: 'margin-top:20px' }, cl.btnConn, cl.btnDis, cl.btnCut));

    /* escenario */
    cl.nodeTitle = h('b'); cl.nodeSub = h('small');
    var n0 = h('div', { class: 'nodo' }, cl.nodeTitle, cl.nodeSub);
    var n1 = h('div', { class: 'nodo broker' }, h('b', { text: 'Broker' }), h('small'));
    var n2 = h('div', { class: 'nodo' }, h('b', { text: 'Panel de monitoreo' }), h('small'));
    cl.nodeEls = [n0, n1, n2]; cl.cable = h('div', { class: 'cable' });
    cl.nodos = h('div', { class: 'nodos' }, cl.cable, n0, n1, n2);
    cl.plazo = h('div', { class: 'plazo', 'aria-live': 'polite' });
    cl.cableNote = h('span'); cl.cableNote.hidden = true;
    cl.result = h('div', { class: 'resultado', role: 'status' });
    right.appendChild(h('div', { class: 'escena' }, cl.nodos, cl.plazo));
    right.appendChild(cl.result);

    /* publicar y suscribir */
    var sT = textField('Filtro', C.subTopic, function (v) { C.subTopic = v; cChanged(); }, 'largo');
    var sQ = selectField('QoS', [['0', '0'], ['1', '1'], ['2', '2']], String(C.subQos), function (v) { C.subQos = parseInt(v, 10); cChanged(); }, 'corto');
    cl.subBtn = h('button', { type: 'button', class: 'btn chico', text: 'Suscribirse', onclick: doSubscribe });
    cl.subMsg = h('p', { class: 'peq', style: 'margin-top:8px;min-height:1.2em' });
    var pT = textField('Topic', C.pubTopic, function (v) { C.pubTopic = v; cChanged(); }, 'largo');
    var pP = textField('Mensaje', C.pubPayload, function (v) { C.pubPayload = v; cChanged(); }, 'corto');
    var pQ = selectField('QoS', [['0', '0'], ['1', '1'], ['2', '2']], String(C.pubQos), function (v) { C.pubQos = parseInt(v, 10); cChanged(); }, 'corto');
    var pR = sw('Retenido', 'El broker guarda este valor para quien se suscriba después.', function (v) { C.pubRetain = v; cChanged(); });
    cl.pubBtn = h('button', { type: 'button', class: 'btn chico', text: 'Publicar', onclick: doPublish });
    cl.pubMsg = h('p', { class: 'peq', style: 'margin-top:8px;min-height:1.2em' });
    cl.setPubSub = function () { sT.inp.value = C.subTopic; pT.inp.value = C.pubTopic; pP.inp.value = C.pubPayload; pQ.sel.value = String(C.pubQos); pR.inp.checked = C.pubRetain; sQ.sel.value = String(C.subQos); wSw.inp.checked = C.willOn; wBox.hidden = !C.willOn; wT.inp.value = C.willTopic; wP.inp.value = C.willPayload; wQ.sel.value = String(C.willQos); wR.inp.checked = C.willRetain; cleanSw.inp.checked = C.clean; kaIn.value = C.keepalive; kaTxt(); };
    right.appendChild(h('div', { class: 'listas', style: 'margin-top:20px' },
      h('div', null, h('h4', { text: 'Suscribirse', style: 'margin-bottom:6px' }), h('div', { class: 'fila', style: 'margin-top:0' }, sT.el, sQ.el), h('div', { class: 'fila' }, cl.subBtn), cl.subMsg),
      h('div', null, h('h4', { text: 'Publicar', style: 'margin-bottom:6px' }), h('div', { class: 'fila', style: 'margin-top:0' }, pT.el, pP.el, pQ.el), pR.el, h('div', { class: 'fila' }, cl.pubBtn), cl.pubMsg)));

    cl.devFeed = h('ul', { class: 'feed' }); cl.panelFeed = h('ul', { class: 'feed' });
    feedEmpty(cl.devFeed, 'Suscríbete a un filtro y publica desde la otra terminal.'); feedEmpty(cl.panelFeed, 'El panel recibe todo lo que se publique.');
    right.appendChild(h('div', { class: 'listas', style: 'margin-top:18px' },
      h('div', null, h('div', { class: 'lista-t' }, h('span', { text: 'Recibió tu dispositivo' })), cl.devFeed),
      h('div', null, h('div', { class: 'lista-t' }, h('span', { text: 'Recibió el panel (escucha #)' }), h('button', { type: 'button', class: 'btn suave chico', text: 'Reconectar panel', onclick: function () { feedEmpty(cl.panelFeed, 'Panel reconectado: solo verás lo retenido.'); panelManual = true; if (panel) MQ.disconnect(panel); setTimeout(connectPanel, 200); } })), cl.panelFeed)));
    var lg = logBox('Registro del broker');
    right.appendChild(h('div', { style: 'margin-top:18px' }, lg.el));

    host.appendChild(shell.el);
    cCbs.push(setNodes);
    MQ.onChange(setNodes);
    connectPanel(); setNodes();
  }

  /* ================= laboratorio 4: terminales ================= */
  var HELP_SUB = ['mosquitto_sub: opciones disponibles en este simulador', '  -h host      equipo del broker (localhost por defecto)', '  -p puerto    puerto (1883; 8883 si hay TLS)', '  -t topic     filtro al que suscribirse (se puede repetir)', '  -u / -P      usuario y contraseña', '  -i id        ID del cliente      -c  sesión persistente (pide -i)', '  -q 0|1|2     QoS pedido          -k  keep alive en segundos', '  -v           mostrar "topic mensaje"   -R  ignorar retenidos', '  -C n         salir tras n mensajes     -W s  salir tras s segundos', '  -d           mostrar los paquetes      --cafile ca.crt  usar TLS'];
  var HELP_PUB = ['mosquitto_pub: opciones disponibles en este simulador', '  -h host      equipo del broker (localhost por defecto)', '  -p puerto    puerto (1883; 8883 si hay TLS)', '  -t topic     topic donde publicar', '  -m texto     mensaje        -n  mensaje vacío', '  -u / -P      usuario y contraseña', '  -i id        ID del cliente   -q 0|1|2  QoS   -r  retenido', '  -d           mostrar los paquetes   --cafile ca.crt  usar TLS', '  --will-topic / --will-payload / --will-qos / --will-retain'];

  function parseArgs(line) {
    var out = [], cur = '', q = null, has = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (q) { if (ch === q) q = null; else cur += ch; }
      else if (ch === '"' || ch === "'") { q = ch; has = true; }
      else if (/\s/.test(ch)) { if (cur !== '' || has) { out.push(cur); cur = ''; has = false; } }
      else cur += ch;
    }
    if (cur !== '' || has) out.push(cur);
    return out;
  }
  var NEEDS = { '-h': 'host', '--host': 'host', '-p': 'port', '--port': 'port', '-t': 'topic', '--topic': 'topic', '-m': 'msg', '--message': 'msg', '-q': 'qos', '--qos': 'qos', '-u': 'user', '--username': 'user', '-P': 'pw', '--pw': 'pw', '-i': 'id', '--id': 'id', '-k': 'keepalive', '--keepalive': 'keepalive', '-C': 'count', '-W': 'timeout', '--cafile': 'cafile', '--will-topic': 'wt', '--will-payload': 'wp', '--will-qos': 'wq' };
  var FLAGS = { '-v': 'verbose', '--verbose': 'verbose', '-d': 'debug', '--debug': 'debug', '-r': 'retain', '--retain': 'retain', '-c': 'persist', '--disable-clean-session': 'persist', '-n': 'nullmsg', '--null-message': 'nullmsg', '-R': 'noret', '--will-retain': 'wr', '--insecure': 'insecure', '--no-tls': 'notls', '--ws': 'ws' };
  function parseMosq(args) {
    var o = { host: 'localhost', port: null, topics: [], msg: null, qos: 0, retain: false, user: null, pw: null, id: null, keepalive: 60, verbose: false, debug: false, persist: false, nullmsg: false, noret: false, count: null, timeout: null, cafile: null, wt: null, wp: '', wq: 0, wr: false, insecure: false, notls: false, ws: false, err: null };
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (NEEDS[a]) {
        var v = args[i + 1];
        if (v === undefined) { o.err = 'Error: ' + a + ' argument given but no value specified.'; return o; }
        i++;
        var k = NEEDS[a];
        if (k === 'topic') o.topics.push(v);
        else if (k === 'port' || k === 'qos' || k === 'keepalive' || k === 'count' || k === 'timeout' || k === 'wq') {
          var n = parseInt(v, 10);
          if (isNaN(n)) { o.err = 'Error: Invalid value "' + v + '" for ' + a + '.'; return o; }
          if (k === 'qos' || k === 'wq') { if (n < 0 || n > 2) { o.err = 'Error: Invalid QoS ' + n + '. QoS must be 0, 1 or 2.'; return o; } }
          if (k === 'port') o.port = n; else if (k === 'qos') o.qos = n; else if (k === 'wq') o.wq = n; else o[k] = n;
        } else o[k] = v;
      }
      else if (FLAGS[a]) o[FLAGS[a]] = true;
      else if (a === '--help') { o.help = true; }
      else { o.err = "Error: Unknown option '" + a + "'."; return o; }
    }
    return o;
  }

  function Term(cfg) {
    var self = this, hist = [], hi = 0, running = null;
    this.pant = h('div', { class: 'pant', tabindex: '0', role: 'log', 'aria-label': cfg.title });
    this.inp = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Línea de comandos de ' + cfg.title, placeholder: 'escribe un comando y pulsa Enter' });
    var btnC = h('button', { type: 'button', text: 'Ctrl+C', onclick: function () { self.interrupt(); } });
    var btnL = h('button', { type: 'button', text: 'Limpiar', onclick: function () { self.pant.innerHTML = ''; } });
    var chips = h('div', { class: 'ejemplos' });
    cfg.examples.forEach(function (c) { chips.appendChild(h('button', { type: 'button', class: 'chip cmd', title: 'Colocar en la terminal', text: c, onclick: function () { if (running) return; self.inp.value = c; self.inp.focus(); } })); });
    this.el = h('div', { class: 'term' }, h('div', { class: 'cab' }, h('span', { text: cfg.title }), h('span', null, btnC, ' ', btnL)), this.pant,
      h('div', { class: 'linea' }, h('span', { text: '$' }), this.inp), h('div', { class: 'ejemplos', style: 'padding-bottom:0;padding-top:8px;color:var(--consola-mute);font-family:var(--f-titulo);font-size:.76rem', text: 'Toca un ejemplo y pulsa Enter:' }), chips);
    this.out = function (t, cls) { var sp = h('div', { class: cls || '', text: t }); self.pant.appendChild(sp); self.pant.scrollTop = self.pant.scrollHeight; };
    this.inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var l = self.inp.value; self.inp.value = ''; self.run(l); }
      else if (e.key === 'ArrowUp') { if (hist.length) { hi = Math.max(0, hi - 1); self.inp.value = hist[hi]; e.preventDefault(); } }
      else if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); self.inp.value = hist[hi] || ''; e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && running) { e.preventDefault(); self.interrupt(); }
    });
    this.pant.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && running) { e.preventDefault(); self.interrupt(); } });
    this.interrupt = function () { if (running) { self.out('^C', 'n'); running.stop('Ctrl+C'); } };
    this.setRunning = function (r) { running = r; self.inp.disabled = !!r; if (!r) self.inp.focus({ preventScroll: true }); };
    this.run = function (line) {
      line = line.trim();
      self.out('alumno@aula:~$ ' + line, 'p');
      if (!line) return;
      hist.push(line); hi = hist.length;
      var args = parseArgs(line), cmd = args.shift();
      if (cmd === 'clear') { self.pant.innerHTML = ''; return; }
      if (cmd === 'help') { self.out('Comandos de este simulador: mosquitto_sub, mosquitto_pub, clear, help', 'n'); self.out('Escribe mosquitto_sub --help o mosquitto_pub --help para ver las opciones.', 'n'); return; }
      if (cmd === 'mosquitto_sub') { self.sub(args); return; }
      if (cmd === 'mosquitto_pub') { self.pub(args); return; }
      self.out('bash: ' + cmd + ': command not found', 'e');
    };
    /* conexión común */
    this.connectWith = function (o, who, extra) {
      var tls = !o.notls && (o.cafile !== null || o.port === 8883) && !o.ws;
      var port = o.port !== null ? o.port : (o.cafile !== null ? 8883 : 1883);
      var transport = o.ws ? 'ws' : (tls ? 'tls' : 'tcp');
      var origin = (o.host === 'localhost' || o.host === '127.0.0.1' || o.host === '::1') ? 'local' : 'remote';
      var id = o.id || ('mosq-' + MQ.rnd(18, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'));
      var dbg = function (t) { if (o.debug) self.out(t, 'n'); };
      dbg('Client ' + id + ' sending CONNECT');
      if (transport === 'tls' && !o.cafile && MQ.listenerAt(port) === 'tls') {
        self.out('Error: A TLS error occurred.', 'e');
        self.out('Pista: el certificado del broker lo firmó una autoridad propia. Dile al cliente en cuál confiar con --cafile ca.crt.', 'n');
        return null;
      }
      if (transport === 'tls' && o.cafile && !/\.(crt|pem|cer)$/i.test(o.cafile)) { self.out('Error: Problem setting TLS options: File not found.', 'e'); return null; }
      var r = MQ.connect({ transport: transport, port: port, origin: origin, id: id, user: o.user || '', pass: o.pw || '', keepalive: o.keepalive, clean: !o.persist, will: o.wt ? { topic: o.wt, payload: o.wp, qos: o.wq, retain: o.wr } : null, onMessage: extra.onMessage, onClosed: extra.onClosed, label: id });
      if (!r.ok) {
        if (r.stage === 'connack') self.out('Connection error: ' + r.text, 'e');
        else self.out('Error: ' + r.text.replace(/\.$/, '') + (r.text === 'Connection refused' ? '' : '.'), 'e');
        self.out('Pista: ' + r.es, 'n');
        return null;
      }
      dbg('Client ' + id + ' received CONNACK (0)');
      r.dbg = dbg; r.cid = id;
      return r;
    };
    this.sub = function (args) {
      var o = parseMosq(args);
      if (o.help) { HELP_SUB.forEach(function (l) { self.out(l, 'n'); }); return; }
      if (o.err) { self.out(o.err, 'e'); self.out("Use 'mosquitto_sub --help' to see usage.", 'n'); return; }
      if (!o.topics.length) { self.out('Error: You must specify a topic to subscribe to.', 'e'); self.out("Use 'mosquitto_sub --help' to see usage.", 'n'); return; }
      if (o.persist && !o.id) { self.out('Error: You must provide a client id if you are using the -c option.', 'e'); return; }
      var got = 0, finished = false, timer = null;
      var conn = self.connectWith(o, 'sub', {
        onMessage: function (m) {
          if (o.noret && m.retain) return;
          o.debug && self.out('Client ' + conn.cid + " received PUBLISH (d0, q" + m.qos + ", r" + (m.retain ? 1 : 0) + ", m0, '" + m.topic + "', ... (" + m.payload.length + ' bytes))', 'n');
          self.out(o.verbose ? m.topic + ' ' + m.payload : m.payload, 'm');
          got++;
          if (o.count !== null && got >= o.count) stop(null);
        },
        onClosed: function (why) { if (!finished) { finished = true; if (timer) clearTimeout(timer); self.setRunning(null); if (why === 'restart') self.out('Error: The connection was lost.', 'e'); if (why === 'takeover') self.out('Error: The connection was lost.', 'e'); } }
      });
      if (!conn) return;
      var denied = 0;
      o.topics.forEach(function (t, i) {
        conn.dbg('Client ' + conn.cid + ' sending SUBSCRIBE (Mid: ' + (i + 1) + ", Topic: " + t + ', QoS: ' + o.qos + ', Options: 0x00)');
        var s = MQ.subscribe(conn.client, t, o.qos);
        conn.dbg('Client ' + conn.cid + ' received SUBACK');
        if (!s.ok) denied++;
      });
      if (denied === o.topics.length) {
        self.out('All subscription requests were denied.', 'e');
        self.out('Pista: la ACL no deja leer ese filtro. El SUBACK vuelve con el código 0x80.', 'n');
        finished = true; MQ.disconnect(conn.client); return;
      }
      function stop(why) {
        if (finished) return; finished = true; if (timer) clearTimeout(timer);
        conn.dbg('Client ' + conn.cid + ' sending DISCONNECT');
        MQ.disconnect(conn.client); self.setRunning(null);
        if (why === 'timeout') self.out('(tiempo agotado: mosquitto_sub termina con el código de salida 27)', 'n');
      }
      self.setRunning({ stop: function (w) { stop(w); } });
      if (o.timeout !== null) timer = setTimeout(function () { stop('timeout'); }, o.timeout * 1000);
      self.out('(escuchando; pulsa Ctrl+C para salir)', 'n');
    };
    this.pub = function (args) {
      var o = parseMosq(args);
      if (o.help) { HELP_PUB.forEach(function (l) { self.out(l, 'n'); }); return; }
      if (o.err) { self.out(o.err, 'e'); self.out("Use 'mosquitto_pub --help' to see usage.", 'n'); return; }
      if (o.topics.length !== 1) { self.out('Error: You must specify a topic to publish to.', 'e'); self.out("Use 'mosquitto_pub --help' to see usage.", 'n'); return; }
      if (o.msg === null && !o.nullmsg) { self.out('Error: Both topic and message must be supplied.', 'e'); self.out("Use 'mosquitto_pub --help' to see usage.", 'n'); return; }
      var conn = self.connectWith(o, 'pub', { onMessage: function () {}, onClosed: function () {} });
      if (!conn) return;
      var payload = o.nullmsg ? '' : o.msg;
      conn.dbg('Client ' + conn.cid + " sending PUBLISH (d0, q" + o.qos + ", r" + (o.retain ? 1 : 0) + ", m1, '" + o.topics[0] + "', ... (" + payload.length + ' bytes))');
      var r = MQ.publish(conn.client, o.topics[0], payload, o.qos, o.retain);
      if (o.qos > 0) conn.dbg('Client ' + conn.cid + ' received PUBACK (Mid: 1, RC:0)');
      conn.dbg('Client ' + conn.cid + ' sending DISCONNECT');
      MQ.disconnect(conn.client);
      if (!r.ok) self.out('(no se imprimió ningún error, pero el broker descartó el mensaje: mira el registro de abajo)', 'n');
    };
  }

  function buildTerminales() {
    var host = $('#lab-terminal');
    var shell = labShell('Dos terminales conectadas al mismo broker', 'Como cuando se prueba un broker en clase', '');
    var guion = h('ol', { style: 'margin:0 0 6px;padding-left:1.2em;font-family:var(--f-titulo);font-size:.92rem;line-height:1.5' },
      h('li', { text: 'En la terminal 1 suscríbete a invernadero/# (primer ejemplo).' }),
      h('li', { text: 'En la terminal 2 publica una temperatura: aparece sola en la terminal 1.' }),
      h('li', { html: 'Baja al <a href="#broker">laboratorio 1</a> y elige la plantilla Aula segura. Repite el paso 2: el broker contesta not authorised.' }),
      h('li', { text: 'Agrega -u sensor1 -P clave123 y publica en sala1 y en sala2: la ACL deja pasar una y bloquea la otra.' }));
    var t1 = new Term({ title: 'Terminal 1: suscriptor', examples: [
      "mosquitto_sub -h localhost -t 'invernadero/#' -v",
      "mosquitto_sub -h localhost -u panel -P panel456 -t 'invernadero/#' -v",
      "mosquitto_sub -d -t 'invernadero/#' -v -C 1",
      "mosquitto_sub -h 192.168.1.50 -p 8883 --cafile ca.crt -u panel -P panel456 -t 'invernadero/#' -v",
      "mosquitto_sub -u anonimo2 -P x -t 'invernadero/#' -W 5"] });
    var t2 = new Term({ title: 'Terminal 2: publicador', examples: [
      'mosquitto_pub -h localhost -t invernadero/sala1/temperatura -m 24.5',
      'mosquitto_pub -h localhost -u sensor1 -P clave123 -t invernadero/sala1/temperatura -m 25.1 -r',
      'mosquitto_pub -u sensor1 -P clave123 -t invernadero/sala2/temperatura -m 30',
      'mosquitto_pub -u sensor1 -P mala -t invernadero/sala1/temperatura -m 24',
      'mosquitto_pub -u sensor1 -P clave123 -t invernadero/sala1/temperatura -n -r',
      'mosquitto_pub -d -q 1 -t invernadero/sala1/temperatura -m 22'] });
    var lg = logBox('Registro del broker (mosquitto.log)');
    shell.body.className = 'lab-cuerpo';
    shell.body.appendChild(h('div', { class: 'grupo' }, h('h4', { text: 'Guion sugerido para la demostración' }), guion));
    shell.body.appendChild(h('div', { class: 'terms' }, t1.el, t2.el));
    shell.body.appendChild(lg.el);
    host.appendChild(shell.el);
    t1.out('Terminal lista. Prueba el primer ejemplo y pulsa Enter.', 'n');
    t2.out('Terminal lista. Publica cuando la terminal 1 esté escuchando.', 'n');
  }

  /* ================= código real ================= */
  function q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function shq(s) { return /^[A-Za-z0-9_.\/:@%+=,-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  function genEsp32() {
    var L = [], tls = C.transport === 'tls', hasU = !!C.user;
    L.push('// ESP32 con la librería PubSubClient (Arduino IDE)');
    if (C.transport === 'ws') L.push('// Aviso: PubSubClient no habla WebSockets. En el ESP32 usa un listener TCP (1883 o 8883).');
    L.push('#include <WiFi.h>');
    if (tls) L.push('#include <WiFiClientSecure.h>');
    L.push('#include <PubSubClient.h>', '');
    L.push('const char* WIFI_SSID = "TU_WIFI";', 'const char* WIFI_PASS = "TU_CLAVE_WIFI";', '');
    L.push('const char* MQTT_HOST = ' + q(C.host) + ';', 'const int   MQTT_PORT = ' + C.port + ';', 'const char* CLIENT_ID = ' + q(C.id) + ';');
    if (hasU) L.push('const char* MQTT_USER = ' + q(C.user) + ';', 'const char* MQTT_PASS = ' + q(C.pass) + ';');
    L.push('const char* TOPIC_PUB = ' + q(C.pubTopic) + ';', 'const char* TOPIC_SUB = ' + q(C.subTopic) + ';');
    if (C.willOn) L.push('const char* TOPIC_WILL = ' + q(C.willTopic) + ';');
    if (tls) L.push('', '// Pega aquí el contenido de ca.crt (la autoridad que firmó el certificado del broker)', 'const char* CA_CERT = "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----\\n";');
    L.push('', tls ? 'WiFiClientSecure net;' : 'WiFiClient net;', 'PubSubClient mqtt(net);', '');
    L.push('void conectarWiFi() {', '  WiFi.begin(WIFI_SSID, WIFI_PASS);', '  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }', '  Serial.println(" WiFi listo");', '}', '');
    L.push('void alRecibir(char* topic, byte* payload, unsigned int length) {', '  Serial.print(topic); Serial.print(": ");', '  for (unsigned int i = 0; i < length; i++) Serial.print((char)payload[i]);', '  Serial.println();', '}', '');
    L.push('void conectarMQTT() {', '  while (!mqtt.connected()) {', '    Serial.print("Conectando a MQTT... ");', '    // connect(id, usuario, clave, willTopic, willQos, willRetain, willMessage, cleanSession)');
    L.push('    if (mqtt.connect(CLIENT_ID, ' + (hasU ? 'MQTT_USER, MQTT_PASS' : 'NULL, NULL') + ', ' + (C.willOn ? 'TOPIC_WILL, ' + C.willQos + ', ' + (C.willRetain ? 'true' : 'false') + ', ' + q(C.willPayload) : 'NULL, 0, false, NULL') + ', ' + (C.clean ? 'true' : 'false') + ')) {');
    L.push('      Serial.println("conectado");', '      mqtt.subscribe(TOPIC_SUB' + (C.subQos > 0 ? ', 1' : '') + ');');
    if (C.subQos === 2) L.push('      // PubSubClient solo permite suscribirse con QoS 0 o 1');
    L.push('    } else {', '      Serial.print("fallo, state=");', '      Serial.println(mqtt.state());   // 4 = usuario o clave mal, 5 = no autorizado', '      delay(3000);', '    }', '  }', '}', '');
    L.push('void setup() {', '  Serial.begin(115200);', '  conectarWiFi();');
    if (tls) L.push('  net.setCACert(CA_CERT);       // para pruebas rápidas existe net.setInsecure(), pero no verifica nada');
    L.push('  mqtt.setServer(MQTT_HOST, MQTT_PORT);', '  mqtt.setKeepAlive(' + (C.keepalive || 15) + ');' + (C.keepalive === 0 ? '   // PubSubClient no admite 0; se deja el valor por defecto de 15 s' : ''), '  mqtt.setBufferSize(512);          // el búfer por defecto es pequeño', '  mqtt.setCallback(alRecibir);', '}', '');
    L.push('void loop() {', '  if (!mqtt.connected()) conectarMQTT();', '  mqtt.loop();                      // llamar seguido: mantiene vivo el keep alive', '', '  static unsigned long ultimo = 0;', '  if (millis() - ultimo > 5000) {', '    ultimo = millis();', '    mqtt.publish(TOPIC_PUB, ' + q(C.pubPayload) + ', ' + (C.pubRetain ? 'true' : 'false') + ');   // PubSubClient publica con QoS 0', '  }', '}');
    return L;
  }
  function genPy() {
    var L = [], tls = C.transport === 'tls', ws = C.transport === 'ws';
    L.push('# Python con paho-mqtt 2.x  (pip install paho-mqtt)', 'import paho.mqtt.client as mqtt', '');
    L.push('BROKER = ' + q(C.host), 'PORT = ' + C.port, 'CLIENT_ID = ' + q(C.id), '');
    L.push('def on_connect(client, userdata, flags, reason_code, properties):', '    if reason_code.is_failure:', '        print("Fallo al conectar:", reason_code)', '        return', '    print("Conectado. Session present:", flags.session_present)', '    client.subscribe(' + q(C.subTopic) + ', qos=' + C.subQos + ')', '    client.publish(' + q(C.pubTopic) + ', ' + q(C.pubPayload) + ', qos=' + C.pubQos + ', retain=' + (C.pubRetain ? 'True' : 'False') + ')', '');
    L.push('def on_message(client, userdata, msg):', '    print(msg.topic, msg.payload.decode())', '');
    L.push('client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID, clean_session=' + (C.clean ? 'True' : 'False') + (ws ? ', transport="websockets"' : '') + ')');
    if (C.user) L.push('client.username_pw_set(' + q(C.user) + ', ' + q(C.pass) + ')');
    if (C.willOn) L.push('client.will_set(' + q(C.willTopic) + ', ' + q(C.willPayload) + ', qos=' + C.willQos + ', retain=' + (C.willRetain ? 'True' : 'False') + ')   # antes de connect()');
    if (tls) L.push('client.tls_set(ca_certs="ca.crt")   # la autoridad que firmó el certificado del broker');
    L.push('client.on_connect = on_connect', 'client.on_message = on_message', '', 'client.connect(BROKER, PORT, keepalive=' + C.keepalive + ')', 'client.loop_forever()');
    return L;
  }
  function genCli() {
    var L = [], tls = C.transport === 'tls';
    var base = '-h ' + shq(C.host) + ' -p ' + C.port + (C.user ? ' -u ' + shq(C.user) + ' -P ' + shq(C.pass) : '') + (tls ? ' --cafile ca.crt' : '');
    L.push('# Escuchar (con los ajustes del formulario)');
    L.push('mosquitto_sub ' + base + ' -i ' + shq(C.id) + (C.clean ? '' : ' -c') + ' -k ' + C.keepalive + ' -q ' + C.subQos + ' -t ' + shq(C.subTopic) + ' -v');
    L.push('', '# Publicar');
    L.push('mosquitto_pub ' + base + ' -i ' + shq(C.id + '-pub') + ' -q ' + C.pubQos + (C.pubRetain ? ' -r' : '') + ' -t ' + shq(C.pubTopic) + ' -m ' + shq(C.pubPayload));
    if (C.willOn) { L.push('', '# Con testamento (se publica si el cliente se cae sin DISCONNECT)'); L.push('mosquitto_pub ' + base + ' -t ' + shq(C.pubTopic) + ' -m ' + shq(C.pubPayload) + ' --will-topic ' + shq(C.willTopic) + ' --will-payload ' + shq(C.willPayload) + ' --will-qos ' + C.willQos + (C.willRetain ? ' --will-retain' : '')); }
    if (C.transport === 'ws') L.push('', '# Los clientes de línea de comandos pueden usar WebSockets con la opción --ws');
    return L;
  }
  function buildCodigo() {
    var host = $('#lab-codigo');
    var shell = labShell('Código generado', 'Cambia el formulario del laboratorio 3 y el código se actualiza', '');
    var hostF = textField('IP o nombre del broker', C.host, function (v) { C.host = v; cChanged(); }, 'largo');
    var info = h('p', { class: 'peq', style: 'margin:0' });
    var box = codeBox('Arduino (ESP32)', 'cpp'), nota = h('div', { class: 'hint', style: 'margin-top:14px;margin-bottom:0' });
    var cur = 'esp';
    var tb = tabsBar([['esp', 'ESP32 con Arduino'], ['py', 'Python con paho-mqtt'], ['cli', 'Línea de comandos']], function (k) { cur = k; render(); }, 'claras');
    function render() {
      var lg = cur === 'esp' ? 'cpp' : cur === 'py' ? 'py' : 'sh';
      var cb2 = box; cb2.title(cur === 'esp' ? 'sketch.ino' : cur === 'py' ? 'cliente.py' : 'terminal');
      var lines = cur === 'esp' ? genEsp32() : cur === 'py' ? genPy() : genCli();
      // cambiar el idioma de coloreado reconstruyendo la caja
      var nb = codeBox(cur === 'esp' ? 'sketch.ino' : cur === 'py' ? 'cliente.py' : 'terminal', lg); nb.set(lines);
      box.el.replaceWith(nb.el); box = nb;
      info.textContent = 'Transporte: ' + TNAME[C.transport] + ', puerto ' + C.port + ', ID ' + (C.id || '(vacío)') + ', keep alive ' + C.keepalive + ' s, sesión ' + (C.clean ? 'limpia' : 'persistente') + (C.willOn ? ', con testamento' : '') + '.';
      nota.innerHTML = '';
      var t = cur === 'esp' ? 'PubSubClient publica solo con QoS 0 y se suscribe con QoS 0 o 1. Su keep alive por defecto es de 15 segundos y hay que llamar a mqtt.loop() seguido. Si el mensaje es largo, sube el búfer con setBufferSize.' : cur === 'py' ? 'En paho-mqtt 2 la versión de callbacks se elige al crear el cliente. will_set se llama antes de connect, y loop_forever mantiene vivo el keep alive.' : 'Con -c se pide sesión persistente y es obligatorio dar un ID con -i. Las clientes de línea de comandos activan TLS solos en el puerto 8883.';
      nota.appendChild(h('div', null, h('b', { text: 'Para recordar: ' }), t));
    }
    shell.body.appendChild(h('div', null, h('div', { class: 'fila', style: 'margin-top:0' }, hostF.el), h('div', { style: 'margin:10px 0 14px' }, info), tb.el, box.el, nota));
    host.appendChild(shell.el);
    cCbs.push(render); MQ.onChange(render); render();
  }

  /* ================= diagnóstico ================= */
  function irCliente() { irA('cliente'); }
  var DIAG = [
    { id: 'refused', t: 'No conecta y dice "Connection refused"', s: 'Error: Connection refused',
      ver: 'Error: Connection refused', causas: ['El broker no está en marcha, o ningún listener usa ese puerto.', 'El listener está atado a 127.0.0.1 y llegas desde otro equipo.', 'El firewall bloquea el puerto.'],
      pasos: ['Comprueba el servicio: sudo systemctl status mosquitto.', 'Busca la línea listener en mosquitto.conf y confirma el puerto.', 'Abre el puerto en el firewall, por ejemplo sudo ufw allow 1883/tcp.', 'Prueba primero desde el mismo equipo con -h localhost.'],
      repro: function () { S.cfg = MQ.defaults(); S.cfg.tcp.port = 1884; C.transport = 'tcp'; C.port = 1883; C.user = ''; C.pass = ''; MQ.emit(); }, reproTxt: 'Mover el listener al 1884 y conectar al 1883' },
    { id: 'notauth', t: 'Dice "not authorised" al conectar', s: 'Connection Refused: not authorised',
      ver: 'Connection error: Connection Refused: not authorised.', causas: ['allow_anonymous es false y el cliente no mandó usuario.', 'Usuario o contraseña incorrectos.', 'El archivo passwd no existe, tiene otra ruta o Mosquitto no puede leerlo.'],
      pasos: ['Manda usuario y contraseña con -u y -P (o en el código del cliente).', 'Recrea la clave con mosquitto_passwd, sin -c si ya hay otros usuarios.', 'Revisa que la ruta de password_file exista y sea legible por el usuario mosquitto.', 'Mira mosquitto.log: dice si fue un usuario desconocido.'],
      repro: function () { S.cfg = MQ.defaults(); S.cfg.auth = true; C.transport = 'tcp'; C.port = 1883; C.user = ''; C.pass = ''; MQ.emit(); }, reproTxt: 'Exigir contraseña y conectar sin credenciales' },
    { id: 'remoto', t: 'Funciona en mi PC pero no desde otro dispositivo', s: 'solo localhost',
      ver: 'localhost: conecta bien\nESP32 en la red: Connection refused', causas: ['El listener tiene la dirección 127.0.0.1 o no se definió ningún listener (Mosquitto 2 queda en modo solo local).', 'El firewall del equipo del broker no deja entrar al puerto.', 'El ESP32 apunta a localhost en vez de a la IP del broker.'],
      pasos: ['Define listener 1883 sin dirección (o con la IP de la red).', 'Usa la IP del broker en el cliente, no localhost.', 'Abre el puerto en el firewall.', 'Con allow_anonymous false o una ACL, recuerda añadir las credenciales.'],
      repro: function () { S.cfg = MQ.defaults(); S.cfg.tcp.local = true; C.transport = 'tcp'; C.port = 1883; C.origin = 'remote'; C.user = ''; C.pass = ''; MQ.emit(); }, reproTxt: 'Atar el listener a 127.0.0.1 y conectar desde otro equipo' },
    { id: 'bucle', t: 'El ESP32 se conecta y se desconecta sin parar', s: 'ID duplicado, keep alive',
      ver: 'Client esp32-sensor01 already connected, closing old connection.', causas: ['Dos dispositivos usan el mismo ID: el broker expulsa al anterior y se pelean.', 'El código tarda más que el keep alive sin llamar a mqtt.loop().', 'La señal WiFi es inestable.'],
      pasos: ['Da a cada dispositivo un ID único, por ejemplo con parte de su dirección MAC.', 'Llama a mqtt.loop() seguido y evita delay() largos.', 'Sube el keep alive si la red es lenta.'],
      repro: function () { S.cfg = MQ.defaults(); C.transport = 'tcp'; C.port = 1883; C.user = ''; C.pass = ''; C.origin = 'remote'; MQ.emit(); irCliente(); doConnect().then(function () { return wait(1100); }).then(function () { var r = MQ.connect({ transport: 'tcp', port: 1883, origin: 'remote', id: (C.id || '').trim(), user: '', pass: '', keepalive: 60, clean: true, will: null, onMessage: function () {}, label: 'intruso' }); if (r.ok) setTimeout(function () { MQ.disconnect(r.client); }, 500); }); return true; }, reproTxt: 'Conectar el dispositivo y luego un segundo cliente con el mismo ID' },
    { id: 'acl', t: 'Publico y no aparece nada, pero tampoco hay error', s: 'Denied PUBLISH en el registro',
      ver: "Denied PUBLISH from esp32-sensor01 (d0, q0, r0, m1, 'invernadero/sala2/temperatura', ... (4 bytes))", causas: ['La ACL no deja al usuario escribir en ese topic: el broker descarta el mensaje sin avisar.', 'El topic tiene una diferencia de mayúsculas o una barra inicial.', 'El suscriptor usa un filtro que no coincide.'],
      pasos: ['Lee mosquitto.log: aparece la línea Denied PUBLISH.', 'Revisa las reglas de la ACL para ese usuario y topic.', 'Usa el probador de permisos para comprobarlo antes de cambiar el código.', 'Recuerda que los topics distinguen mayúsculas de minúsculas.'],
      repro: function () { S.cfg = MQ.defaults(); S.cfg.auth = true; S.cfg.acl = true; C.transport = 'tcp'; C.port = 1883; C.user = 'sensor1'; C.pass = 'clave123'; C.pubTopic = 'invernadero/sala2/temperatura'; C.pubPayload = '30'; C.pubQos = 0; MQ.emit(); cl.setIdent(); cl.setPubSub(); cl.setPort(); irCliente(); doConnect().then(function () { return wait(500); }).then(function () { doPublish(); }); return true; }, reproTxt: 'Activar la ACL y publicar en sala2 con sensor1' },
    { id: 'retain', t: 'El panel nuevo no ve el último dato hasta que el sensor publique otra vez', s: 'falta retain',
      ver: '(el panel se abre y no muestra ningún valor)', causas: ['El sensor publicó sin la marca retain: el broker entrega el mensaje solo a quien ya estaba suscrito.'],
      pasos: ['Publica los valores de estado con retain (opción -r o el parámetro retained).', 'Para borrar un retenido, publica un mensaje vacío en el mismo topic con retain.', 'No uses retain para órdenes: se ejecutarían de nuevo al reconectar.'],
      repro: function () { S.cfg = MQ.defaults(); C.transport = 'tcp'; C.port = 1883; C.user = ''; C.pass = ''; C.pubTopic = 'invernadero/sala1/temperatura'; C.pubPayload = '24.5'; C.pubRetain = true; C.pubQos = 0; MQ.emit(); cl.setIdent(); cl.setPubSub(); cl.setPort(); irCliente(); doConnect().then(function () { return wait(500); }).then(function () { doPublish(); return wait(900); }).then(function () { panelManual = true; if (panel) MQ.disconnect(panel); feedEmpty(cl.panelFeed, 'Panel reconectado: solo verás lo retenido.'); setTimeout(connectPanel, 200); }); return true; }, reproTxt: 'Publicar con retain y reconectar el panel para ver que lo recibe al instante' },
    { id: 'will', t: 'El testamento nunca se publica', s: 'Last Will',
      ver: '(el panel nunca recibe el mensaje "offline")', causas: ['El cliente se desconectó con DISCONNECT limpio: el broker descarta el testamento.', 'El usuario no puede escribir en el topic del testamento (la ACL lo bloquea y el CONNECT se rechaza).', 'El testamento se definió después de connect() o no se definió.', 'Keep alive en 0: el broker no detecta la caída.'],
      pasos: ['Define el testamento antes de conectar.', 'Para probarlo, corta la red del dispositivo o usa el botón Cortar el cable; no lo desconectes con DISCONNECT.', 'Da permiso de escritura al usuario en el topic del testamento.', 'Usa un keep alive mayor que 0.'],
      repro: function () { S.cfg = MQ.defaults(); C.transport = 'tcp'; C.port = 1883; C.user = ''; C.pass = ''; C.willOn = true; C.willTopic = 'invernadero/sala1/estado'; C.willPayload = 'offline'; C.keepalive = 60; MQ.emit(); cl.setIdent(); cl.setPubSub(); cl.setPort(); irCliente(); doConnect().then(function () { return wait(900); }).then(function () { doDisconnect(); }); return true; }, reproTxt: 'Conectar con testamento y desconectar de forma limpia' },
    { id: 'buffer', t: 'Los mensajes largos no llegan desde el ESP32', s: 'PubSubClient',
      ver: 'mqtt.publish(...) devuelve false', causas: ['PubSubClient tiene un búfer pequeño por defecto. Si el paquete lo supera, la publicación falla o se ignora.'],
      pasos: ['Llama a mqtt.setBufferSize(1024) antes de conectar.', 'Acorta el topic y el mensaje.', 'Comprueba el valor devuelto por publish().'], repro: null },
    { id: 'tls', t: 'Error de TLS al conectar al puerto 8883', s: 'A TLS error occurred',
      ver: 'Error: A TLS error occurred.', causas: ['El cliente no confía en la autoridad que firmó el certificado (falta --cafile o setCACert).', 'La fecha del dispositivo está mal y el certificado parece vencido.', 'El nombre del servidor no coincide con el del certificado.', 'El cliente habla TLS con un puerto sin cifrar, o al revés.'],
      pasos: ['Entrega al cliente el ca.crt correcto.', 'Revisa la fecha y hora del dispositivo.', 'Inspecciona el certificado: openssl s_client -connect IP:8883 -showcerts.', 'Verifica que el puerto sea el del listener TLS.'],
      repro: function () { S.cfg = MQ.defaults(); S.cfg.tls.on = true; C.transport = 'tcp'; C.port = 8883; C.user = ''; C.pass = ''; MQ.emit(); cl.setPort(); irCliente(); doConnect(); return true; }, reproTxt: 'Abrir el listener TLS y conectar al 8883 sin cifrado' }
  ];
  function buildDiag() {
    var host = $('#lab-diag');
    var wrap = h('div'), grid = h('div', { class: 'sintomas' }), det = h('div', { 'aria-live': 'polite' });
    var btns = [];
    DIAG.forEach(function (d, i) {
      var b = h('button', { type: 'button', class: 'sintoma', 'aria-pressed': 'false', onclick: function () { pick(i); } }, d.t, h('small', { text: d.s }));
      btns.push(b); grid.appendChild(b);
    });
    function pick(i) {
      var d = DIAG[i];
      btns.forEach(function (b, j) { b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      var izq = h('div', null, h('h4', { text: 'Lo que ves' }), h('pre', { class: 'ver', text: d.ver }), h('h4', { text: 'Causas probables' }), h('ul', null, d.causas.map(function (c) { return h('li', { text: c }); })));
      var der = h('div', null, h('h4', { text: 'Cómo se arregla' }), h('ol', null, d.pasos.map(function (c) { return h('li', { text: c }); })));
      if (d.repro) der.appendChild(h('div', { style: 'margin-top:16px' }, h('button', { type: 'button', class: 'btn chico', text: 'Reproducirlo en el simulador', onclick: function () { var done = d.repro(); if (!done) irCliente(); } }), h('p', { class: 'peq', style: 'margin-top:8px', text: d.reproTxt })));
      det.innerHTML = ''; det.appendChild(h('div', { class: 'diag' }, izq, der));
    }
    wrap.appendChild(grid); wrap.appendChild(det);
    host.appendChild(wrap);
    pick(0);
  }

  /* ================= repaso ================= */
  var PREG = [
    { q: 'Instalaste Mosquitto 2 y tu archivo mosquitto.conf no tiene ninguna línea listener. ¿Quién puede conectarse?', o: ['Cualquier equipo de la red, sin contraseña', 'Solo clientes del mismo equipo', 'Nadie: el broker no arranca'], c: 1, e: 'Sin listeners, Mosquitto 2 entra en modo solo local: acepta conexiones anónimas únicamente desde la propia máquina. Para abrirlo a la red hay que definir un listener.' },
    { q: '¿Qué logra la línea allow_anonymous false?', o: ['Cifra todas las conexiones', 'Exige que los clientes manden usuario y contraseña', 'Impide que nadie publique mensajes retenidos'], c: 1, e: 'Los clientes sin usuario son rechazados. Los usuarios válidos se definen con password_file u otro mecanismo de autenticación; el cifrado es asunto de TLS.' },
    { q: 'Un cliente se conecta con keep alive de 60 segundos y se desconecta el cable sin despedirse. ¿Cuándo lo da por caído el broker?', o: ['De inmediato', 'Tras 60 segundos', 'Tras 90 segundos, 1,5 veces el keep alive'], c: 2, e: 'La especificación MQTT dice que el broker debe cerrar la conexión si no recibe ningún paquete en una vez y media el keep alive. Con 60 s son 90 s.' },
    { q: '¿Cuándo publica el broker el mensaje de testamento (Last Will)?', o: ['Cuando el cliente se desconecta con DISCONNECT', 'Cuando el cliente se cae sin enviar DISCONNECT', 'Cada vez que el cliente se conecta'], c: 1, e: 'El testamento avisa de caídas inesperadas. Si el cliente se despide con DISCONNECT, el broker lo descarta.' },
    { q: 'Quieres añadir un segundo usuario al archivo de contraseñas. ¿Qué error evitas al no usar la opción -c?', o: ['Que se cree un usuario sin contraseña', 'Que el archivo se vuelva a crear y borre a los usuarios anteriores', 'Que el usuario quede en modo anónimo'], c: 1, e: 'Con -c mosquitto_passwd crea el archivo desde cero. Si ya existía, se pierde su contenido. Solo el primer usuario lleva -c.' },
    { q: 'En un ESP32 con la librería PubSubClient, ¿con qué QoS puedes publicar?', o: ['Solo QoS 0', 'QoS 0 y 1', 'QoS 0, 1 y 2'], c: 0, e: 'PubSubClient publica con QoS 0. Para suscribirse admite QoS 0 o 1. Si necesitas más garantías, hay que usar otra librería.' }
  ];
  function buildQuiz() {
    var host = $('#lab-quiz'), i = 0, score = 0, marks = [];
    var box = h('div', { class: 'quiz' });
    host.appendChild(box);
    function render() {
      box.innerHTML = '';
      if (i >= PREG.length) {
        box.appendChild(h('div', { class: 'prog' }, marks.map(function (m) { return h('i', { class: m }); })));
        box.appendChild(h('p', { class: 'nota-final', text: score + ' de ' + PREG.length + ' correctas' }));
        box.appendChild(h('p', { text: score === PREG.length ? 'Perfecto: ya manejas la configuración de MQTT.' : score >= 4 ? 'Muy bien. Repasa las preguntas que fallaste en los laboratorios.' : 'Vuelve a los laboratorios: probar cada ajuste ayuda a recordarlo.' }));
        box.appendChild(h('button', { type: 'button', class: 'btn', text: 'Intentarlo otra vez', onclick: function () { i = 0; score = 0; marks = []; render(); } }));
        return;
      }
      var p = PREG[i], done = false;
      box.appendChild(h('div', { class: 'prog' }, PREG.map(function (_, j) { return h('i', { class: j < marks.length ? marks[j] : (j === i ? 'ahora' : '') }); })));
      box.appendChild(h('h3', { text: p.q }));
      var ops = h('div', { class: 'opciones' }), exp = h('div', { 'aria-live': 'polite' });
      var btns = p.o.map(function (t, j) {
        var b = h('button', { type: 'button', class: 'opcion', text: t, onclick: function () {
          if (done) return; done = true;
          var ok = j === p.c; if (ok) score++; marks.push(ok ? 'ok' : 'no');
          btns.forEach(function (x, k) { x.disabled = true; if (k === p.c) x.classList.add('bien'); else if (k === j) x.classList.add('mal'); });
          exp.appendChild(h('div', { class: 'explic' }, h('b', { text: ok ? 'Correcto. ' : 'No exactamente. ' }), p.e));
          exp.appendChild(h('div', { style: 'margin-top:14px' }, h('button', { type: 'button', class: 'btn chico', text: i === PREG.length - 1 ? 'Ver resultado' : 'Siguiente pregunta', onclick: function () { i++; render(); } })));
        } });
        ops.appendChild(b); return b;
      });
      box.appendChild(ops); box.appendChild(exp);
      box.appendChild(h('div', { class: 'pie' }, h('span', { text: 'Pregunta ' + (i + 1) + ' de ' + PREG.length })));
    }
    render();
  }

  /* ================= arranque ================= */
  function init() {
    buildNav(); buildHero(); buildStatus(); buildRuta();
    buildInstalar(); buildBroker(); buildPermisos(); buildCliente(); buildTerminales(); buildCodigo(); buildDiag(); buildQuiz();
    MQ.log('mosquitto version 2.0 starting', '', 'Broker simulado listo. Lo que configures arriba se aplica a todos los laboratorios.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
