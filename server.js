/* eslint-disable no-multi-assign */
const express = require('express');
const session = require('express-session');
const mrequest = require('request');

console.log('Alarm & Alert Service server starting ... ');

const TEST = false;

let config;
let globConf;

if (!TEST) {
  config = require('/etc/aaasf/config.json');
  globConf = require('/etc/aaasf/globus-config.json');
} else {
  config = require('./kube/secrets/config.json');
  globConf = require('./kube/secrets/globus-config.json');
}

console.log(config);

// App
const app = express();

app.use(express.static('./static'));

app.set('view engine', 'pug');

app.set('views', 'views');

app.use(express.json()); // to support JSON-encoded bodies
app.use(session({
  secret: 'mamicu mu njegovu',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 3600000 },
}));

const usr = require('./routes/user')(app, config);

// GLOBUS STUFF
const auth = 'Basic ' + new Buffer(globConf.CLIENT_ID + ':' + globConf.CLIENT_SECRET).toString('base64');

const jupyterCreator = async (req, res, next) => {
  if (req.body === 'undefined' || req.body === null) {
    res.status(400).send('nothing POSTed.');
    return;
  }

  console.log('body:', req.body);

  if (
    typeof req.body.name !== 'undefined' && req.body.name
    && typeof req.body.password !== 'undefined' && req.body.password
    && typeof req.body.gpus !== 'undefined' && req.body.gpus
    && typeof req.body.time !== 'undefined' && req.body.time
  ) {
    console.log('Creating a private JupyterLab.');
    try {
      req.body.time = parseInt(req.body.time, 10);
      req.body.gpus = parseInt(req.body.gpus, 10);
    } catch (error) {
      res.sendStatus(400).send('unparseable parameters.');
      return;
    }
    next();
  } else {
    res.sendStatus(400).send('not all parameters POSTed.');
  }
};

const requiresLogin = async (req, _res, next) => {
  // to be used as middleware

  if (req.session.loggedIn !== true) {
    console.log('NOT logged in!');
    const error = new Error('You must be logged in to view this page.');
    error.status = 403;
    return next(error);
  }

  if (config.APPROVAL_REQUIRED === false) return next();

  console.log('Authorization required - searching for: ', req.session.user_id);

  const user = new usr.User(req.session.user_id);
  await user.load();

  if (user.approved === true) {
    console.log('authorized.');
    return next();
  }

  console.log('NOT authorized!');
  const error = new Error('You must be authorized for this service.');
  error.status = 403;
  return next(error);
};

// =============   routes ========================== //

app.get('/delete/:jservice', requiresLogin, (request, response) => {
  const { jservice } = request.params;
  response.redirect('/');
});

app.get('/get_users_services/:servicetype', async (req, res) => {
  const { servicetype } = req.params;
  console.log('user:', req.session.user_id, 'running services.', servicetype);
});

app.get('/get_services_from_es/:servicetype', async (req, res) => {
  console.log(req.params);
  const { servicetype } = req.params;
  console.log('user:', req.session.user_id, 'service:', servicetype);

  const user = new usr.User(req.session.user_id);
  await user.load();
  user.print();
  res.status(200).send('smgth');
});

app.post('/jupyter', requiresLogin, jupyterCreator, (_req, res) => {
  console.log('Private Jupyter created!');
  res.status(200).send(res.link);
});

app.get('/login', async (req, res) => {
  console.log('Logging in');
  if (config.TESTING) {
    const user = new usr.User('test_id');
    await user.load();
    console.log('fake loaded');
    user.write();
    console.log('fake written.');
    req.session.user_id = user.id;
    req.session.name = user.name;
    req.session.username = user.username;
    req.session.affiliation = user.affiliation;
    req.session.email = user.email;
    req.session.loggedIn = true;
    res.render('index', req.session);
  } else {
    const red = `${globConf.AUTHORIZE_URI}?scope=urn%3Aglobus%3Aauth%3Ascope%3Aauth.globus.org%3Aview_identities+openid+email+profile&state=garbageString&redirect_uri=${globConf.redirect_link}&response_type=code&client_id=${globConf.CLIENT_ID}`;
    // console.log('redirecting to:', red);
    res.redirect(red);
  }
});

app.get('/logout', (req, res) => { // , next
  if (req.session.loggedIn) {
    // logout from Globus
    const requestOptions = {
      uri: `https://auth.globus.org/v2/web/logout?client_id=${globConf.CLIENT_ID}`,
      headers: {
        Authorization: `Bearer ${req.session.token}`,
      },
      json: true,
    };

    mrequest.get(requestOptions, (error) => { // , response, body
      if (error) {
        console.log('logout failure...', error);
      }
      console.log('globus logout success.\n');
    });
  }
  req.session.destroy();

  res.redirect('/');
});

app.get('/authcallback', (req, res) => {
  console.log('AUTH CALLBACK query:', req.query);
  let { code } = req.query;
  if (code) {
    console.log('there is a code. first time around.');
    code = req.query.code;
    const { state } = req.query;
    console.log('AUTH CALLBACK code:', code, '\tstate:', state);
  } else {
    console.log('NO CODE call...');
  }

  const red = `${globConf.TOKEN_URI}?grant_type=authorization_code&redirect_uri=${globConf.redirect_link}&code=${code}`;

  const requestOptions = {
    uri: red, method: 'POST', headers: { Authorization: auth }, json: true,
  };

  // console.log(requestOptions);

  mrequest.post(requestOptions, (error, _response, body) => {
    if (error) {
      console.log('failure...', error);
      res.redirect('/');
    }
    console.log('success');// , body);

    req.session.loggedIn = true;

    console.log('==========================\n getting name.');
    const idRed = 'https://auth.globus.org/v2/oauth2/userinfo';
    const idrequestOptions = {
      uri: idRed,
      method: 'POST',
      json: true,
      headers: { Authorization: `Bearer ${body.access_token}` },
    };

    mrequest.post(idrequestOptions, async (error, _response, body) => {
      if (error) {
        console.log('error on geting username:\t', error);
      }
      console.log('body:\t', body);
      const user = new usr.User();
      user.id = req.session.user_id = body.sub;
      user.username = req.session.username = body.preferred_username;
      user.affiliation = req.session.affiliation = body.organization;
      user.name = req.session.name = body.name;
      user.email = req.session.email = body.email;
      const found = await user.load();
      if (found === false) {
        await user.write();
      }
      console.log('user is authorized:', user.approved);
      req.session.authorized = user.approved;
      if (user.approved === false) {
        user.ask_for_approval();
      }
      res.render('index', req.session);
    });
  });
});

app.get('/healthz', (_req, res) => {
  // console.log('Checking health and if some private pod/service needs deletion.');
  try {
    res.status(200).send('OK');
  } catch (err) {
    console.log('not OK.', err);
  }
});

app.get('/', async (req, res) => {
  console.log('===========> / CALL');
  if (req.session.loggedIn === undefined) {
    console.log('Defining...');
    req.session.loggedIn = !config.APPROVAL_REQUIRED;
    req.session.Title = config.TITLE;
    req.session.plugins = config.PLUGINS;
  }
  console.log(req.session);
  res.render('index', req.session);
});

app.use((req, res) => {
  console.error('Unexisting page requested:', req.path);
  console.error('Parameters:', req.params);
  res.status(404);
  res.render('error', { error: 'Not Found' });
});

app.listen(80, () => {
  console.log('Listening on port 80.');
});

async function main() {
  try {
    console.log('main.');
  } catch (err) {
    console.error('Error: ', err);
  }
}

main();
