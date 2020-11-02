module.exports = function us(app, config) {
  const elasticsearch = require('@elastic/elasticsearch');
  const esUsersIndex = 'aaas_users';

  let mgConf;

  if (!config.TESTING) {
    mgConf = require('/etc/aaasf/mg-config.json');
  } else {
    mgConf = require('../kube/secrets/mg-config.json');
  }

  // const mg = require('mailgun-js')({ apiKey: mgConf.APPROVAL_MG, domain: mgConf.MG_DOMAIN });

  const module = {};

  module.User = class User {
    constructor(id = null) {
      this.es = new elasticsearch.Client({ node: config.ES_HOST, log: 'error' });
      this.mg = require('mailgun-js')({ apiKey: mgConf.APPROVAL_MG, domain: mgConf.MG_DOMAIN });
      this.created_at = new Date().getTime();
      if (id) { this.id = id; }
    }

    async write() {
      console.log('adding user to ES...');
      try {
        const response = await this.es.index({
          index: esUsersIndex,
          id: this.id,
          refresh: true,
          body: {
            username: this.username,
            affiliation: this.affiliation,
            user: this.name,
            email: this.email,
            created_at: new Date().getTime()
          },
        });
        console.log(response);
      } catch (err) {
        console.error(err);
      }
      console.log('Done.');
    }

    async delete() {
      console.log('deleting user from ES...');
      try {
        const response = await this.es.deleteByQuery({
          index: esUsersIndex,
          body: { query: { match: { _id: this.id } } },
        });
        console.log(response);
      } catch (err) {
        console.error(err);
      }
      console.log('Done.');
    }

    async load() {
      console.log("getting user's info...");

      try {
        const response = await this.es.search({
          index: esUsersIndex,
          body: {
            query: {
              bool: {
                must: [
                  { match: { _id: this.id } },
                ],
              },
            },
          },
        });

        console.debug(response.body.hits);

        if (response.body.hits.total.value === 0) {
          console.log('user not found.');
          return false;
        }
        console.log('User found.');
        const obj = response.body.hits.hits[0]._source;
        // console.log(obj);
        // var created_at = new Date(obj.created_at).toUTCString();
        this.name = obj.user;
        this.email = obj.email;
        this.affiliation = obj.affiliation;
        this.created_at = obj.created_at;
        return true;
      } catch (err) {
        console.error(err);
      }
      console.log('Done.');
      return false;
    }

    send_mail_to_user(data) {
      this.mg.messages().send(data, (error, body) => {
        console.log(body);
      });
    }


    async add_service(service) {
      try {
        service.owner = this.id;
        service.timestamp = new Date().getTime();
        service.user = this.name;
        console.log('creating service in es: ', service);
        await this.es.index({
          index: 'ml_front', body: service,
        }, (err, resp, _status) => {
          console.log('from ES indexer:', resp);
        });
      } catch (err) {
        console.error(err);
      }
    }

    async terminate_service(name) {
      console.log('terminating service in ES: ', name, 'owned by', this.id);
      console.log('not implemented yet.');
      // try {
      //     const response = await this.es.update({
      //         index: 'ml_front',  id: this.id,
      //         body: {
      //             doc: {
      //                 "terminated_on": new Date().getTime(),
      //                 "terminated": true
      //             }
      //         }
      //     });
      //     console.log(response);
      // } catch (err) {
      //     console.error(err)
      // }
      console.log('Done.');
    }

    async get_services(servicetype) {
      console.log('getting all services >', servicetype, '< of user:', this.id);
      try {
        const resp = await this.es.search({
          index: 'ml_front',
          body: {
            query: {
              bool: {
                must: [
                  { match: { owner: this.id } },
                ],
              },
            },
            sort: { timestamp: { order: 'desc' } },
          },
        });
        // console.log(resp);
        let toSend = [];
        if (resp.body.hits.total.value > 0) {
          // console.log(resp.body.hits.hits);
          for (let i = 0; i < resp.body.hits.hits.length; i++) {
            let obj = resp.body.hits.hits[i]._source;
            if (obj.service !== servicetype) continue;
            console.log(obj);
            const startDate = new Date(obj.timestamp).toUTCString();
            if (servicetype === 'privatejupyter') {
              const endDate = new Date(obj.timestamp + obj.ttl * 86400000).toUTCString();
              const serv = [obj.service, obj.name, startDate, endDate, obj.gpus, obj.cpus, obj.memory];
              toSend.push(serv);
            }
            if (servicetype === 'sparkjob') {
              var serv = [obj.service, obj.name, startDate, obj.executors, obj.repository];
              toSend.push(serv);
            }
          }
        } else {
          console.log('no services found.');
        }
        return toSend;
      } catch (err) {
        console.error(err);
      }
      return [];
    }

    print() {
      console.log('- user id', this.id);
      console.log('- user name', this.name);
      console.log('- email', this.email);
      console.log('- affiliation', this.affiliation);
      console.log('- created at', this.created_at);
    }

    async get_all_users() {
      console.log('getting all users info from es.');
      try {
        const resp = await this.es.search({
          index: esUsersIndex,
          body: {
            size: 1000,
            sort: { created_at: { order: 'desc' } },
          },
        });
        // console.log(resp);
        let toSend = [];
        if (resp.body.hits.total.value > 0) {
          // console.log("Users found:", resp.body.hits.hits);
          for (let i = 0; i < resp.body.hits.hits.length; i++) {
            const obj = resp.body.hits.hits[i]._source;
            // console.log(obj);
            const createdAt = new Date(obj.created_at).toUTCString();
            const serv = [obj.user, obj.email, obj.affiliation, createdAt];
            toSend.push(serv);
          }
        } else {
          console.log('No users found.');
        }
        return toSend;
      } catch (err) {
        console.error(err);
      }
      console.log('Done.');
    }
  };

  // probably not needed.
  app.get('/user', (req, res) => {
    console.log('sending profile info back.');
    res.json({
      loggedIn: req.session.loggedIn,
      name: req.session.name,
      email: req.session.email,
      username: req.session.username,
      organization: req.session.organization,
      user_id: req.session.user_id,
      authorized: req.session.authorized,
    });
  });

  app.get('/users_data', async (req, res) => {
    console.log('Sending all users info...');
    const user = new module.User();
    const data = await user.get_all_users();
    res.status(200).send(data);
    console.log('Done.');
  });

  app.get('/profile', async (req, res) => {
    console.log('profile called!');
    res.render('profile', req.session);
  });

  return module;
};
