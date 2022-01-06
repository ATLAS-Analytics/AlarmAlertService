const fs = require('fs');
const express = require('express');
const session = require('express-session');
const axios = require('axios').default;

console.log('Alarm & Alert Service server starting ... ');

const TEST = false;

let config;
let globConf;

if (!TEST) {
  config = JSON.parse(fs.readFileSync('/etc/aaasf/config.json', 'utf8'));
  globConf = JSON.parse(fs.readFileSync('/etc/aaasf/globus-config.json', 'utf8'));
} else {
  config = JSON.parse(fs.readFileSync('./kube/secrets/config.json', 'utf8'));
  globConf = JSON.parse(fs.readFileSync('./kube/secrets/globus-config.json', 'utf8'));
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

const usr = require('./routes/user');
const alarms = require('./routes/alarms');

usr.init(config);
alarms.init(config);

app.use('/user', usr.router);
app.use('/alarm', alarms.router);

// GLOBUS STUFF
const bup = Buffer.from(`${globConf.CLIENT_ID}:${globConf.CLIENT_SECRET}`).toString('base64');
const auth = `Basic ${bup}`;

const requiresLogin = async (req, res, next) => {
  // to be used as middleware
  if (req.session.loggedIn !== true) {
    console.log('NOT logged in!');
    res.redirect('/');
  } else {
    next();
  }
};

app.get('/login', async (req, res) => {
  console.log('Logging in');
  const params = new URLSearchParams({
    scope: 'openid email profile urn:globus:auth:scope:auth.globus.org:view_identities',
    state: 'garbageString',
    response_type: 'code',
    redirect_uri: globConf.REDIRECT_LINK,
    client_id: globConf.CLIENT_ID,
    client_secret: globConf.CLIENT_SECRET,
  });
  const red = `${globConf.AUTHORIZE_URI}?${params.toString()}`;
  // ?scope=urn%3Aglobus%3Aauth%3Ascope%3Aauth.globus.org%3Aview_identities+openid+email+profile
  // &state=garbageString
  // &redirect_uri=${globConf.REDIRECT_LINK}
  // &response_type=code
  // &client_id=${globConf.CLIENT_ID}`;
  console.log('redirecting to:', red);
  res.redirect(red);
});

app.get('/logout', (req, res) => {
  if (req.session.loggedIn) {
    axios.get(globConf.LOGOUT_URI, {
      params: {
        client_id: globConf.CLIENT_ID,
      },
      headers: {
        Authorization: `Bearer ${req.session.token}`,
      },
    })
      .then((response) => {
        console.log(`logout status: ${response.status} globus logout success.`);
      })
      .catch((error) => {
        console.log('logout failure...', error);
      })
      .then(() => {
        req.session.destroy();
        res.redirect('/');
      });
  }
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

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: globConf.REDIRECT_LINK,
  });
  console.log('params:', params.toString());
  axios.post(
    `${globConf.TOKEN_URI}`,//?${params.toString()}`,
    // null,
    {
      params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: auth,
      },
    },
  )
    .then((res1) => {
      console.log(`statusCode1: ${res1.status}`);
      console.log('success1:', res1.data);
      console.log('==========================\n getting name.');

      axios.post(
        'https://auth.globus.org/v2/oauth2/userinfo',
        null,
        {
          headers: {
            Authorization: `Bearer ${res1.data.access_token}`,
          },
        },
      )
        .then((res2) => {
          console.log(`statusCode2: ${res2.status}`);
          console.log('res2:\t', res2.data);
          const u = {
            id: res2.data.sub,
            name: res2.data.name,
            email: res2.data.email,
            username: res2.data.preferred_username,
            affiliation: res2.data.organization,
          };
          usr.addIfNeeded(u);
          req.session.user = u;
          req.session.loggedIn = true;
        })
        .catch((error2) => {
          console.log('error2 on geting username:\t', error2);
        })
        .then(() => {
          res.render('index', req.session);
        });

    // mrequest.post(idrequestOptions, async (error1, response1, body1) => {
    //   if (error1) {
    //     console.log('error on geting username:\t', error1);
    //   } else {
    //     console.log('body:\t', body1);
    //     const u = {
    //       id: body1.sub,
    //       name: body1.name,
    //       email: body1.email,
    //       username: body1.preferred_username,
    //       affiliation: body1.organization,
    //     };
    //     usr.addIfNeeded(u);
    //     req.session.user = u;
    //   }
    //   res.render('index', req.session);
    // });
    })
    .catch((error1) => {
      console.log('error1:', error1);
      res.redirect('/');
    });
});

app.get('/subscriptions', requiresLogin, async (req, res) => {
  console.log(`showing all alarms to user: ${req.session.user_id}`);
  const userInfo = await usr.loadUser(req.session.user.id);
  const categories = await alarms.loadCategories();
  // console.log('userINFO', userInfo);
  // TODO logic if returned info is false
  userInfo.loggedIn = true;
  userInfo.userId = req.session.user.id;
  userInfo.categories = categories;
  res.render('subscriptions', userInfo);
});

app.get('/viewer', requiresLogin, async (req, res) => {
  const data = {};
  data.categories = await alarms.loadCategories();
  if (req.session.user !== undefined && req.session.user.id !== undefined) {
    data.loggedIn = true;
  }
  res.render('viewer', data);
});

app.get('/docs', async (req, res) => {
  if (req.session.user === undefined || req.session.user.id === undefined) {
    res.render('docs');
  } else {
    const userInfo = { loggedIn: true };
    res.render('docs', userInfo);
  }
});

app.get('/profile', requiresLogin, async (req, res) => {
  console.log('profile called!');
  const userInfo = await usr.loadUser(req.session.user.id);
  // console.log('userINFO', userInfo);
  // TODO logic if returned info is false
  userInfo.loggedIn = true;
  userInfo.userId = req.session.user.id;
  userInfo.config = config.PREFERENCES;
  res.render('profile', userInfo);
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
    req.session.loggedIn = false;
    req.session.Title = config.TITLE;
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

// app.use((error, req, res, next) => {
//   res.status(error.status || 500).send({
//     error: {
//       status: error.status || 500,
//       message: error.message || 'Internal Server Error',
//     },
//   });
// });

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
