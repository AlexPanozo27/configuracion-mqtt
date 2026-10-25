/* Broker MQTT simulado (núcleo sin interfaz).
   Reproduce, de forma simplificada, el comportamiento de Mosquitto 2.x:
   listeners, autenticación, ACL, sesiones, retenidos y testamento. */
(function (root) {
  'use strict';
  var MQ = {};

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function hora() { var d = new Date(); return two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()); }
  function rnd(n, chars) { var s = ''; chars = chars || 'abcdefghijklmnopqrstuvwxyz0123456789'; for (var i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length)); return s; }
  MQ.rnd = rnd;

  /* ---------------- estado de configuración ---------------- */
  MQ.defaults = function () {
    return {
      tcp: { on: true, port: 1883, local: false },
      tls: { on: false, port: 8883 },
      ws: { on: false, port: 9001 },
      auth: false, acl: false, persist: true, maxConn: -1, maxQueued: 1000
    };
  };
  MQ.S = {
    cfg: MQ.defaults(),
    users: [{ name: 'sensor1', pass: 'clave123' }, { name: 'panel', pass: 'panel456' }],
    rules: [
      { who: '@anon', perm: 'read', topic: 'publico/#' },
      { who: 'sensor1', perm: 'write', topic: 'invernadero/sala1/#' },
      { who: 'panel', perm: 'read', topic: 'invernadero/#' },
      { who: '*', perm: 'readwrite', topic: 'clientes/%u/#' }
    ]
  };
  MQ.B = { clients: {}, sessions: {}, retained: {}, logs: [] };

  var changeCbs = [], logCbs = [];
  MQ.onChange = function (fn) { changeCbs.push(fn); };
  MQ.onLog = function (fn) { logCbs.push(fn); };
  MQ.emit = function () { changeCbs.forEach(function (f) { f(); }); };
  MQ.log = function (text, kind, es) {
    var e = { t: hora(), text: text, kind: kind || '', es: es || '' };
    MQ.B.logs.push(e);
    if (MQ.B.logs.length > 160) MQ.B.logs.shift();
    logCbs.forEach(function (f) { f(e); });
    return e;
  };
  MQ.clearLogs = function () { MQ.B.logs = []; logCbs.forEach(function (f) { f(null); }); };

  /* ---------------- topics ---------------- */
  MQ.topicMatches = function (filter, topic) {
    var f = filter.split('/'), t = topic.split('/');
    if (t[0].charAt(0) === '$' && (f[0] === '#' || f[0] === '+')) return false;
    for (var i = 0; i < f.length; i++) {
      if (f[i] === '#') return true;
      if (i >= t.length) return false;
      if (f[i] !== '+' && f[i] !== t[i]) return false;
    }
    return f.length === t.length;
  };

  /* ---------------- ACL ---------------- */
  MQ.acl = function (user, clientId, topic, access, admin) {
    if (admin) return { ok: true, why: 'Cliente de administración del simulador: sin límites.' };
    if (!MQ.S.cfg.acl) return { ok: true, why: 'No hay acl_file: todos los clientes pueden leer y escribir en cualquier topic.' };
    var list = [];
    MQ.S.rules.forEach(function (r) {
      var t = r.topic;
      if (r.who === '@anon') { if (!user) list.push({ r: r, t: t }); }
      else if (r.who === '*') {
        if (t.indexOf('%u') >= 0 && !user) return;
        t = t.replace(/%u/g, user || '').replace(/%c/g, clientId || '');
        list.push({ r: r, t: t });
      }
      else if (user && r.who === user) list.push({ r: r, t: t });
    });
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].r.perm === 'deny' && MQ.topicMatches(list[i].t, topic)) return { ok: false, rule: list[i].r, why: 'Una regla "deny" bloquea ' + list[i].t + '. Las reglas deny se revisan antes que las demás.' };
    }
    for (i = 0; i < list.length; i++) {
      var p = list[i].r.perm;
      if ((p === 'readwrite' || p === access) && MQ.topicMatches(list[i].t, topic)) {
        return { ok: true, rule: list[i].r, ruleTopic: list[i].t, why: 'Coincide con la regla "' + p + ' ' + list[i].t + '"' + (list[i].r.who === '*' ? ' (pattern para todos)' : '') + '.' };
      }
    }
    return { ok: false, why: 'Ninguna regla de este cliente cubre ese topic para ' + (access === 'read' ? 'leer' : 'escribir') + '. Sin regla que coincida, Mosquitto responde que no.' };
  };

  /* ---------------- listeners ---------------- */
  MQ.listenerAt = function (port) {
    var c = MQ.S.cfg;
    if (c.tcp.on && c.tcp.port === port) return 'tcp';
    if (c.tls.on && c.tls.port === port) return 'tls';
    if (c.ws.on && c.ws.port === port) return 'ws';
    return null;
  };
  MQ.activeListeners = function () {
    var c = MQ.S.cfg, l = [];
    if (c.tcp.on) l.push({ kind: 'tcp', port: c.tcp.port, label: c.tcp.local ? 'TCP, solo local' : 'TCP' });
    if (c.tls.on) l.push({ kind: 'tls', port: c.tls.port, label: 'TLS' });
    if (c.ws.on) l.push({ kind: 'ws', port: c.ws.port, label: 'WebSockets' });
    return l;
  };
  MQ.clientCount = function () { return Object.keys(MQ.B.clients).length; };

  function mismatch(ct, k, port) {
    if (ct === 'tcp' && k === 'tls') return { text: 'The connection was lost.', es: 'El puerto ' + port + ' espera un saludo TLS y recibió MQTT en texto plano. Activa el cifrado en el cliente.' };
    if (ct === 'tcp' && k === 'ws') return { text: 'The connection was lost.', es: 'El puerto ' + port + ' habla WebSockets y el cliente envió MQTT directo por TCP. Elige el transporte WebSocket.' };
    if (ct === 'tls' && k === 'tcp') return { text: 'A TLS error occurred.', es: 'El cliente inició TLS pero el puerto ' + port + ' responde sin cifrado. Usa el puerto del listener TLS o quita TLS del cliente.' };
    if (ct === 'tls' && k === 'ws') return { text: 'A TLS error occurred.', es: 'El puerto ' + port + ' es WebSockets sin TLS. Usa un listener TLS o conéctate sin cifrado.' };
    return { text: 'WebSocket handshake failed.', es: 'El puerto ' + port + ' no habla WebSockets. Usa el puerto del listener websockets (por ejemplo 9001).' };
  }
  MQ.mismatch = mismatch;

  /* ---------------- conexión ---------------- */
  function sessionOf(id) { return MQ.B.sessions[id]; }

  function closeClient(c, reason) {
    c.alive = false; c.silent = false;
    delete MQ.B.clients[c.id];
    var s = MQ.B.sessions[c.id];
    if (s && s.client === c) { s.client = null; if (s.clean) delete MQ.B.sessions[c.id]; }
    if (c.onClosed) c.onClosed(reason);
    MQ.emit();
  }

  MQ.connect = function (req) {
    var S = MQ.S, c = S.cfg, B = MQ.B;
    var port = req.port, ct = req.transport;
    var k = MQ.listenerAt(port);
    var ip = req.origin === 'remote' ? '192.168.1.20' : '127.0.0.1';
    var eph = 40000 + Math.floor(Math.random() * 20000);

    if (!k) {
      return { ok: false, stage: 'tcp', text: 'Connection refused', es: 'Nadie escucha en el puerto ' + port + '. Revisa que el broker esté en marcha, que exista un listener con ese puerto y que el firewall lo deje pasar.' };
    }
    if (k !== ct) {
      var m = mismatch(ct, k, port);
      MQ.log('New connection from ' + ip + ':' + eph + ' on port ' + port + '.', '');
      MQ.log('Client <unknown> closed its connection.', 'mal', 'El cliente habla un protocolo distinto al del puerto: el saludo falla antes de llegar a MQTT.');
      return { ok: false, stage: ct === 'tls' ? 'tls' : 'tcp', text: m.text, es: m.es };
    }
    if (k === 'tcp' && c.tcp.local && req.origin === 'remote') {
      return { ok: false, stage: 'tcp', text: 'Connection refused', es: 'El listener 1883 está atado a 127.0.0.1: solo acepta conexiones del propio equipo. Quita ese límite o define otro listener para la red.' };
    }
    if (c.maxConn >= 0 && MQ.clientCount() >= c.maxConn) {
      MQ.log('Client connection from ' + ip + ' denied: max_connections exceeded.', 'mal', 'El listener ya tiene ' + c.maxConn + ' clientes, el máximo que fijaste con max_connections.');
      return { ok: false, stage: 'tcp', text: 'The connection was lost.', es: 'El broker cerró la conexión: se alcanzó max_connections (' + c.maxConn + ').' };
    }

    MQ.log('New connection from ' + ip + ':' + eph + ' on port ' + port + '.', '', 'Se abrió el canal ' + (k === 'tls' ? 'TLS' : k === 'ws' ? 'WebSocket' : 'TCP') + '. Todavía no hay sesión MQTT.');

    var id = req.id;
    if (!id) {
      if (!req.clean) {
        MQ.log('Invalid client ID: empty with clean session off.', 'mal', 'Un cliente sin identificador no puede pedir sesión persistente: no habría cómo reconocerlo después.');
        return { ok: false, stage: 'connack', code: 2, text: 'Connection Refused: identifier rejected.', es: 'CONNACK 2: identificador rechazado. Un ID vacío solo vale con sesión limpia.' };
      }
      id = 'auto-' + rnd(8).toUpperCase();
    }

    var user = req.user || '';
    if (c.auth && !req.admin) {
      var u = null;
      S.users.forEach(function (x) { if (x.name === user) u = x; });
      if (!user) {
        MQ.log('Client ' + id + ' disconnected, not authorised.', 'mal', 'allow_anonymous es false y el cliente no mandó usuario.');
        return { ok: false, stage: 'connack', code: 5, text: 'Connection Refused: not authorised.', es: 'CONNACK 5: no autorizado. El broker exige usuario y contraseña (allow_anonymous false).' };
      }
      if (!u || u.pass !== (req.pass || '')) {
        MQ.log('Client ' + id + ' disconnected, not authorised.', 'mal', 'Usuario o contraseña que no coinciden con password_file.');
        return { ok: false, stage: 'connack', code: 5, text: 'Connection Refused: not authorised.', es: 'CONNACK 5: no autorizado. Mosquitto usa este código tanto para usuario inexistente como para contraseña errónea (otros brokers usan el 4).' };
      }
    }
    var effUser = user || null;

    if (req.will && req.will.topic) {
      var aw = MQ.acl(effUser, id, req.will.topic, 'write', req.admin);
      if (!aw.ok) {
        MQ.log('Client ' + id + ' disconnected, not authorised (will topic ' + req.will.topic + ').', 'mal', 'El topic del testamento también pasa por la ACL: el cliente necesita permiso de escritura en él.');
        return { ok: false, stage: 'connack', code: 5, text: 'Connection Refused: not authorised.', es: 'CONNACK 5: el usuario no puede escribir en el topic del testamento (' + req.will.topic + ').' };
      }
    }

    var old = B.clients[id];
    if (old) {
      MQ.log('Client ' + id + ' already connected, closing old connection.', 'mal', 'Dos dispositivos con el mismo ID se expulsan entre sí en bucle. Cada cliente necesita un ID único.');
      closeClient(old, 'takeover');
    }

    var present = false, sess = sessionOf(id);
    if (req.clean) { delete B.sessions[id]; sess = null; }
    if (!sess) { sess = B.sessions[id] = { id: id, subs: [], queue: [], clean: !!req.clean, client: null }; }
    else { present = true; sess.clean = false; }

    var cl = {
      id: id, user: effUser, label: req.label || id, keepalive: req.keepalive, clean: !!req.clean,
      will: req.will && req.will.topic ? req.will : null, onMessage: req.onMessage || function () {},
      onClosed: req.onClosed || null, alive: true, silent: false, admin: !!req.admin,
      transport: ct, origin: req.origin, port: port, sess: sess
    };
    sess.client = cl;
    B.clients[id] = cl;
    MQ.log('New client connected from ' + ip + ':' + eph + ' as ' + id + ' (p2, c' + (req.clean ? 1 : 0) + ', k' + req.keepalive + (effUser ? ", u'" + effUser + "'" : '') + ').', 'bien',
      'Sesión MQTT abierta. ' + (c.auth ? 'Credenciales aceptadas.' : (user ? 'No hay password_file: el broker ignora la contraseña.' : 'Entró como anónimo.')) + (present ? ' Había una sesión guardada de este ID: se reanuda.' : ''));

    if (present && sess.queue.length) {
      var q = sess.queue.splice(0, sess.queue.length);
      q.forEach(function (msg) { cl.onMessage(msg); });
      MQ.log('Sent ' + q.length + ' queued message(s) to ' + id + '.', '', 'Mensajes QoS 1 o 2 que llegaron mientras el cliente estaba desconectado.');
    }
    MQ.emit();
    return { ok: true, client: cl, code: 0, sessionPresent: present };
  };

  /* ---------------- publicar y suscribir ---------------- */
  function deliver(topic, payload, qos, meta) {
    var n = 0;
    Object.keys(MQ.B.sessions).forEach(function (id) {
      var s = MQ.B.sessions[id], best = -1;
      s.subs.forEach(function (sb) { if (MQ.topicMatches(sb.filter, topic) && sb.qos > best) best = sb.qos; });
      if (best < 0) return;
      var q = Math.min(qos, best);
      var msg = { topic: topic, payload: payload, qos: q, retain: false, will: !!(meta && meta.will), from: meta && meta.from };
      var cl = s.client;
      if (cl && cl.alive && !cl.silent) { cl.onMessage(msg); n++; }
      else if (!s.clean && q >= 1) {
        if (s.queue.length < MQ.S.cfg.maxQueued) s.queue.push(msg);
      }
    });
    return n;
  }

  MQ.publish = function (client, topic, payload, qos, retain, opts) {
    opts = opts || {};
    if (!opts.skipAcl) {
      var a = MQ.acl(client.user, client.id, topic, 'write', client.admin);
      if (!a.ok) {
        MQ.log("Denied PUBLISH from " + client.id + " (d0, q" + qos + ", r" + (retain ? 1 : 0) + ", m1, '" + topic + "', ... (" + payload.length + ' bytes))', 'mal',
          'La ACL no deja escribir ahí. El broker descarta el mensaje en silencio: el cliente no recibe ningún error.');
        return { ok: false, denied: true, why: a.why };
      }
    }
    if (retain) {
      if (payload === '') delete MQ.B.retained[topic];
      else MQ.B.retained[topic] = { payload: payload, qos: qos };
    }
    var n = deliver(topic, payload, qos, { will: opts.will, from: client.id });
    MQ.emit();
    return { ok: true, delivered: n };
  };

  MQ.subscribe = function (client, filter, qos) {
    var a = MQ.acl(client.user, client.id, filter, 'read', client.admin);
    if (!a.ok) {
      MQ.log("Denied SUBSCRIBE from " + client.id + " (topic '" + filter + "', QoS " + qos + ')', 'mal', 'La ACL no deja leer ese filtro. El SUBACK vuelve con el código 0x80 (fallo).');
      return { ok: false, code: 128, why: a.why };
    }
    var found = false;
    client.sess.subs.forEach(function (s) { if (s.filter === filter) { s.qos = qos; found = true; } });
    if (!found) client.sess.subs.push({ filter: filter, qos: qos });
    Object.keys(MQ.B.retained).forEach(function (t) {
      if (MQ.topicMatches(filter, t)) {
        var r = MQ.B.retained[t];
        client.onMessage({ topic: t, payload: r.payload, qos: Math.min(qos, r.qos), retain: true });
      }
    });
    MQ.emit();
    return { ok: true, qos: qos };
  };

  MQ.unsubscribe = function (client, filter) {
    client.sess.subs = client.sess.subs.filter(function (s) { return s.filter !== filter; });
    MQ.emit();
  };

  /* ---------------- cierres ---------------- */
  MQ.disconnect = function (client) {
    if (!client || !client.alive) return;
    client.will = null;
    MQ.log('Client ' + client.id + ' closed its connection.', '', 'DISCONNECT limpio: el broker descarta el testamento porque el cliente se despidió.');
    closeClient(client, 'clean');
  };
  MQ.cut = function (client) { if (client && client.alive) client.silent = true; MQ.emit(); };
  MQ.expire = function (client) {
    if (!client || !client.alive) return;
    MQ.log('Client ' + client.id + ' has exceeded timeout, disconnecting.', 'mal', 'Pasó 1,5 veces el keep alive sin recibir ningún paquete: el broker da por muerto al cliente.');
    var w = client.will;
    closeClient(client, 'timeout');
    if (w && w.topic) {
      MQ.log("Will message from " + client.id + " published to '" + w.topic + "'.", 'bien', 'El broker publica el testamento que el cliente dejó al conectarse.');
      MQ.publish({ id: client.id, user: client.user, admin: true }, w.topic, w.payload || '', w.qos || 0, !!w.retain, { skipAcl: true, will: true });
    }
  };

  MQ.restart = function () {
    var B = MQ.B;
    Object.keys(B.clients).forEach(function (id) { closeClient(B.clients[id], 'restart'); });
    if (MQ.S.cfg.persist) {
      MQ.log('Saving in-memory database to mosquitto.db.', 'bien', 'persistence true: los mensajes retenidos y las sesiones persistentes sobreviven al reinicio.');
      Object.keys(B.sessions).forEach(function (id) { if (B.sessions[id].clean) delete B.sessions[id]; });
    } else {
      MQ.log('mosquitto terminating. Nothing was saved (persistence false).', 'mal', 'Sin persistence, todo lo que estaba en memoria se pierde: retenidos, sesiones y mensajes en cola.');
      B.retained = {}; B.sessions = {};
    }
    MQ.log('mosquitto version 2.0 starting', '', 'El broker arrancó de nuevo con la configuración actual.');
    MQ.emit();
  };

  /* ---------------- archivos generados ---------------- */
  MQ.confLines = function () {
    var c = MQ.S.cfg, L = [];
    function cm(t) { L.push({ type: 'c', txt: '# ' + t }); }
    function bl() { L.push({ type: 'b', txt: '' }); }
    function d(key, txt, es) { L.push({ type: 'd', key: key, txt: txt, es: es }); }
    cm('mosquitto.conf (generado en el laboratorio)');
    bl();
    cm('Quién puede entrar');
    d('allow_anonymous', 'allow_anonymous ' + (c.auth ? 'false' : 'true'), c.auth ? 'Exige usuario y contraseña. Quien no los mande recibe "not authorised".' : 'Deja entrar sin usuario. Cómodo para pruebas, peligroso en una red abierta.');
    if (c.auth) d('password_file', 'password_file /etc/mosquitto/passwd', 'Archivo con los usuarios y sus contraseñas cifradas. Se crea con mosquitto_passwd.');
    if (c.acl) d('acl_file', 'acl_file /etc/mosquitto/acl', 'Archivo con las reglas de quién puede leer o escribir en cada topic.');
    bl();
    cm('Qué recuerda el broker');
    d('persistence', 'persistence ' + (c.persist ? 'true' : 'false'), c.persist ? 'Guarda retenidos y sesiones en disco para que sobrevivan a un reinicio.' : 'Todo vive solo en memoria: un reinicio lo borra.');
    if (c.persist) d('persistence_location', 'persistence_location /var/lib/mosquitto/', 'Carpeta donde se guarda el archivo mosquitto.db.');
    d('max_queued_messages', 'max_queued_messages ' + c.maxQueued, 'Mensajes que el broker guarda por cada cliente desconectado con sesión persistente. El valor por defecto es 1000.');
    bl();
    cm('Registros');
    d('log_dest', 'log_dest file /var/log/mosquitto/mosquitto.log', 'Dónde se escribe el registro. Aquí van los errores que explican por qué falla una conexión.');
    d('connection_messages', 'connection_messages true', 'Anota cada conexión y desconexión de clientes.');
    bl();
    cm('Puertos (listeners)');
    var n = 0;
    if (c.tcp.on) {
      n++;
      d('listener', 'listener ' + c.tcp.port + (c.tcp.local ? ' 127.0.0.1' : ''), c.tcp.local ? 'Abre el puerto ' + c.tcp.port + ' solo para este equipo (dirección 127.0.0.1).' : 'Abre el puerto ' + c.tcp.port + ' en todas las interfaces. MQTT sin cifrar.');
      if (c.maxConn >= 0) d('max_connections', 'max_connections ' + c.maxConn, 'Máximo de clientes conectados al mismo tiempo en este listener.');
    }
    if (c.tls.on) {
      n++;
      d('listener', 'listener ' + c.tls.port, 'Abre el puerto ' + c.tls.port + ' para MQTT con TLS.');
      d('cafile', 'cafile /etc/mosquitto/certs/ca.crt', 'Autoridad certificadora que firmó los certificados.');
      d('certfile', 'certfile /etc/mosquitto/certs/servidor.crt', 'Certificado del broker. Con certfile y keyfile se activa el cifrado.');
      d('keyfile', 'keyfile /etc/mosquitto/certs/servidor.key', 'Clave privada del broker. Nunca se comparte.');
      d('tls_version', 'tls_version tlsv1.2', 'Versión mínima de TLS aceptada. Sin esta línea se permiten tlsv1.2 y tlsv1.3.');
    }
    if (c.ws.on) {
      n++;
      d('listener', 'listener ' + c.ws.port, 'Abre el puerto ' + c.ws.port + ' para clientes que viven en un navegador.');
      d('protocol', 'protocol websockets', 'Hace que este listener hable MQTT sobre WebSockets en lugar de TCP directo.');
    }
    if (!n) cm('Sin listeners: Mosquitto 2 solo acepta conexiones desde este mismo equipo.');
    return L;
  };
  MQ.confText = function () { return MQ.confLines().map(function (l) { return l.txt; }).join('\n') + '\n'; };

  MQ.aclText = function () {
    var S = MQ.S, o = [];
    o.push('# acl (generado en el laboratorio)');
    var anon = S.rules.filter(function (r) { return r.who === '@anon'; });
    o.push('# Clientes anónimos: reglas antes de cualquier línea "user"');
    if (!anon.length) o.push('# (sin reglas: un anónimo no puede nada)');
    anon.forEach(function (r) { o.push('topic ' + r.perm + ' ' + r.topic); });
    var names = [];
    S.rules.forEach(function (r) { if (r.who !== '@anon' && r.who !== '*' && names.indexOf(r.who) < 0) names.push(r.who); });
    names.forEach(function (n) {
      o.push('');
      o.push('user ' + n);
      S.rules.forEach(function (r) { if (r.who === n) o.push('topic ' + r.perm + ' ' + r.topic); });
    });
    var pats = S.rules.filter(function (r) { return r.who === '*'; });
    if (pats.length) {
      o.push('');
      o.push('# Para todos los usuarios: %u es el nombre de usuario y %c el ID del cliente');
      pats.forEach(function (r) { o.push('pattern ' + r.perm + ' ' + r.topic); });
    }
    return o.join('\n') + '\n';
  };

  MQ.passwdText = function () {
    var us = MQ.S.users, o = [];
    o.push('# Primer usuario: -c crea el archivo (si ya existía, lo borra y empieza de cero)');
    us.forEach(function (u, i) {
      if (i === 0) o.push('sudo mosquitto_passwd -c /etc/mosquitto/passwd ' + u.name);
      else { if (i === 1) o.push('# Los demás usuarios van sin -c'); o.push('sudo mosquitto_passwd /etc/mosquitto/passwd ' + u.name); }
    });
    if (!us.length) o.push('# (agrega un usuario para ver el comando)');
    o.push('');
    o.push('# Resultado en /etc/mosquitto/passwd: una línea por usuario con la clave cifrada');
    us.forEach(function (u) { o.push(u.name + ':$7$101$…'); });
    return o.join('\n') + '\n';
  };

  /* ---------------- diagnóstico de la configuración ---------------- */
  MQ.checks = function () {
    var c = MQ.S.cfg, out = [];
    function add(level, title, txt) { out.push({ level: level, title: title, txt: txt }); }
    var plainOpen = c.tcp.on && !c.tcp.local;
    var exposed = plainOpen || c.tls.on || c.ws.on;
    var ports = [], dup = false;
    if (c.tcp.on) ports.push(c.tcp.port);
    if (c.tls.on) ports.push(c.tls.port);
    if (c.ws.on) ports.push(c.ws.port);
    ports.forEach(function (p, i) { if (ports.indexOf(p) !== i) dup = true; });
    if (dup) add('bad', 'Dos listeners usan el mismo puerto', 'Mosquitto no puede abrir el mismo puerto dos veces y no arranca. Cambia uno de los puertos.');
    if (!c.tcp.on && !c.tls.on && !c.ws.on) add('info', 'No hay listeners', 'Mosquitto 2 entra en modo solo local: acepta conexiones anónimas únicamente desde este equipo. Un ESP32 u otro PC no podrán conectarse.');
    if (!c.auth && exposed) add('bad', 'Cualquiera en la red puede publicar y leer', 'allow_anonymous true con un puerto abierto a la red. Exige usuario y contraseña antes de salir del aula.');
    if (!c.auth && !exposed) add('info', 'Acceso anónimo solo desde este equipo', 'Es seguro por aislamiento, pero ningún otro dispositivo podrá conectarse.');
    if (c.auth) add('ok', 'Se exige usuario y contraseña', 'Los clientes anónimos reciben "not authorised".');
    if (c.auth && plainOpen && !c.tls.on) add('warn', 'Las contraseñas viajan en texto plano', 'En el puerto ' + c.tcp.port + ' la clave se puede leer con un sniffer. Añade un listener TLS o limita este puerto al equipo local.');
    if (c.auth && !c.acl) add('warn', 'Todo usuario autenticado puede hacerlo todo', 'Sin acl_file, quien tenga una contraseña lee y escribe en cualquier topic. Activa la ACL para limitarlo.');
    if (c.auth && c.acl) add('ok', 'Cada usuario tiene permisos propios', 'La ACL limita qué topics puede leer y escribir cada uno.');
    if (c.acl && !c.auth) add('warn', 'La ACL sin usuarios casi no sirve', 'Sin contraseñas, todos entran como anónimos y solo cuentan las reglas anónimas. Activa la autenticación.');
    if (c.tls.on) add('ok', 'Hay un puerto cifrado con TLS', 'Recuerda tener ca.crt, servidor.crt y servidor.key válidos y que los clientes confíen en la autoridad que firmó el certificado.');
    if (c.tls.on && !plainOpen) add('ok', 'No hay puerto sin cifrar abierto a la red', 'Todo el tráfico remoto va cifrado.');
    if (!c.persist) add('warn', 'Sin persistencia', 'Un reinicio borra los mensajes retenidos y las sesiones persistentes. Prueba el botón Reiniciar broker.');
    else add('ok', 'Persistencia activada', 'Retenidos y sesiones sobreviven a un reinicio gracias a mosquitto.db.');
    if (c.maxConn >= 0) add('info', 'Hay un límite de ' + c.maxConn + ' conexiones', 'El cliente número ' + (c.maxConn + 1) + ' será rechazado.');
    return out;
  };
  MQ.score = function () {
    var c = MQ.S.cfg;
    var plainOpen = c.tcp.on && !c.tcp.local, exposed = plainOpen || c.tls.on || c.ws.on;
    var s = (exposed ? 0 : 40) + (c.auth ? 35 : 0) + (c.auth && c.acl ? 20 : 0) + (c.tls.on ? 20 : 0) + (exposed && c.tls.on && !plainOpen ? 25 : 0);
    s = Math.min(100, s);
    var lab = s < 25 ? 'Abierto' : s < 55 ? 'Básico' : s < 85 ? 'Bueno' : 'Sólido';
    return { value: s, label: lab };
  };
  MQ.alcance = function () {
    var c = MQ.S.cfg, none = !c.tcp.on && !c.tls.on && !c.ws.on;
    return [
      { t: 'Programas en este equipo', ok: true, d: 'Siempre pueden conectarse a un listener local.' },
      { t: 'Dispositivos de la red (ESP32, otros PC)', ok: (c.tcp.on && !c.tcp.local) || c.tls.on, d: 'Necesitan un listener abierto a la red.' },
      { t: 'Navegadores web', ok: c.ws.on, d: 'Necesitan un listener con protocol websockets.' },
      { t: 'Conexiones cifradas', ok: c.tls.on, d: 'Necesitan un listener con certificados TLS.' }
    ];
  };

  MQ.presets = {
    abierto: function (s) { s.cfg = MQ.defaults(); s.cfg.tcp.on = true; s.cfg.auth = false; s.cfg.acl = false; },
    aula: function (s) { s.cfg = MQ.defaults(); s.cfg.auth = true; s.cfg.acl = true; },
    produccion: function (s) { s.cfg = MQ.defaults(); s.cfg.auth = true; s.cfg.acl = true; s.cfg.tls.on = true; s.cfg.tcp.local = true; s.cfg.ws.on = false; }
  };
  MQ.applyPreset = function (name) {
    var tmp = { cfg: null }; MQ.presets[name](tmp);
    MQ.S.cfg = tmp.cfg; MQ.emit();
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MQ;
  else root.MQ = MQ;
})(typeof window !== 'undefined' ? window : this);
