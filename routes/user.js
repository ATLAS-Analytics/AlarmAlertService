const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const bodyParser = require('body-parser');

const esUsersIndex = 'aaas_users';
let config;
let es;

const router = express.Router();
const jsonParser = bodyParser.json();

function init(configuration) {
  config = configuration;
  es = new elasticsearch.Client(config.ES_HOST);
}

async function addIfNeeded(u) {
  console.log('adding if needed:', u);

  console.log("getting user's info...");

  es.search({ index: esUsersIndex, body: { query: { match: { _id: u.id } } } },
    (err, response) => {
      if (err) {
        console.error('cant lookup user:\n', err);
        return false;
      }
      console.debug(response.body.hits);

      if (response.body.hits.total.value === 0) {
        console.log('user not found. will add it');
        es.index({
          index: esUsersIndex,
          id: u.id,
          refresh: true,
          body: {
            username: u.username,
            affiliation: u.affiliation,
            user: u.name,
            email: u.email,
            created_at: new Date().getTime(),
          },
        }, (err1, response1) => {
          if (err1) {
            console.error('cant index user:\n', err1);
            return false;
          }
          console.log('New user indexed.');
          console.debug(response1.body);
          return true;
        });
      }

      console.log('User found.');
      const obj = response.body.hits.hits[0]._source;
      console.log(obj);
      return true;
    });
}

async function loadUser(userId) {
  console.log("loading user's info...", userId);
  try {
    const response = await es.search(
      { index: esUsersIndex, body: { query: { match: { _id: userId } } } },
    );
    if (response.body.hits.total.value === 0) {
      console.log('User not found.');
      return false;
    }
    console.log('User found.');
    const obj = response.body.hits.hits[0]._source;
    console.log(obj);
    return obj;
  } catch (err) {
    console.error(err);
    return false;
  }
}

//   sendMailToUser(data) {
//     mg.messages().send(data, (error, body) => {
//       console.log(body);
//     });
//   }

//   async add_service(service) {
//     try {
//       service.owner = this.id;
//       service.timestamp = new Date().getTime();
//       service.user = this.name;
//       console.log('creating service in es: ', service);
//       await es.index({
//         index: 'ml_front', body: service,
//       }, (err, resp, _status) => {
//         console.log('from ES indexer:', resp);
//       });
//     } catch (err) {
//       console.error(err);
//     }
//   }

//   async terminate_service(name) {
//     console.log('terminating service in ES: ', name, 'owned by', this.id);
//     console.log('not implemented yet.');
//     // try {
//     //     const response = await es.update({
//     //         index: 'ml_front',  id: this.id,
//     //         body: {
//     //             doc: {
//     //                 "terminated_on": new Date().getTime(),
//     //                 "terminated": true
//     //             }
//     //         }
//     //     });
//     //     console.log(response);
//     // } catch (err) {
//     //     console.error(err)
//     // }
//     console.log('Done.');
//   }

//   async get_services(servicetype) {
//     console.log('getting all services >', servicetype, '< of user:', this.id);
//     try {
//       const resp = await es.search({
//         index: 'ml_front',
//         body: {
//           query: {
//             bool: {
//               must: [
//                 { match: { owner: this.id } },
//               ],
//             },
//           },
//           sort: { timestamp: { order: 'desc' } },
//         },
//       });
//       // console.log(resp);
//       let toSend = [];
//       if (resp.body.hits.total.value > 0) {
//         // console.log(resp.body.hits.hits);
//         for (let i = 0; i < resp.body.hits.hits.length; i++) {
//           let obj = resp.body.hits.hits[i]._source;
//           if (obj.service !== servicetype) continue;
//           console.log(obj);
//           const startDate = new Date(obj.timestamp).toUTCString();
//           if (servicetype === 'privatejupyter') {
//             const endDate = new Date(obj.timestamp + obj.ttl * 86400000).toUTCString();
//             const serv = [obj.service, obj.name, startDate, endDate, obj.gpus, obj.cpus, obj.memory];
//             toSend.push(serv);
//           }
//           if (servicetype === 'sparkjob') {
//             var serv = [obj.service, obj.name, startDate, obj.executors, obj.repository];
//             toSend.push(serv);
//           }
//         }
//       } else {
//         console.log('no services found.');
//       }
//       return toSend;
//     } catch (err) {
//       console.error(err);
//     }
//     return [];
//   }

//   async get_all_users() {
//     console.log('getting all users info from es.');
//     try {
//       const resp = await es.search({
//         index: esUsersIndex,
//         body: {
//           size: 1000,
//           sort: { created_at: { order: 'desc' } },
//         },
//       });
//       // console.log(resp);
//       let toSend = [];
//       if (resp.body.hits.total.value > 0) {
//         // console.log("Users found:", resp.body.hits.hits);
//         for (let i = 0; i < resp.body.hits.hits.length; i++) {
//           const obj = resp.body.hits.hits[i]._source;
//           // console.log(obj);
//           const createdAt = new Date(obj.created_at).toUTCString();
//           const serv = [obj.user, obj.email, obj.affiliation, createdAt];
//           toSend.push(serv);
//         }
//       } else {
//         console.log('No users found.');
//       }
//       return toSend;
//     } catch (err) {
//       console.error(err);
//     }
//     console.log('Done.');
//   }
// };

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  res.json(await loadUser(userId));
  // res.json(req.session.user);
});

router.delete('/:userId', (req, res) => {
  const { userId } = req.params;
  console.log('Deleting user with id:', userId);
  es.deleteByQuery({
    index: esUsersIndex,
    body: { query: { match: { _id: userId } } },
  },
  (err, response) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error in deleting user.');
    } else if (response.body.deleted === 1) {
      res.status(200).send('OK');
    } else {
      console.log(response.body);
      res.status(500).send('No user with that ID.');
    }
  });
});

router.get('/subscriptions/:userId', async (req, res) => {
  console.log('Sending all users subscriptions...');
  const user = new module.User();
  const data = await user.get_all_users();
  res.status(200).send(data);
  console.log('Done.');
});

router.get('/subscriptions/:servicetype', async (req, res) => {
  const { servicetype } = req.params;
  console.log('user:', req.session.user_id, 'running services.', servicetype);
});

exports.router = router;
exports.addIfNeeded = addIfNeeded;
exports.init = init;
