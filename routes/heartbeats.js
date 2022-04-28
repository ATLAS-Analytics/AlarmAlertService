const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const bodyParser = require('body-parser');

const esHeartbeatTopologyIndex = 'aaas_heartbeats_topology';
const esHeartbeatIndex = 'aaas_heartbeats';

let config;
let es;
const categories = [];

const router = express.Router();
const jsonParser = bodyParser.json();

function knownTopology(obj) {
  let found = false;
  categories.forEach((c) => {
    found = true;
    config.TOPOLOGY_FIELDS.forEach((v) => {
      if (c[v] !== obj[v]) {
        found = false;
        return false;
      }
      return true; // continue
    });
    if (found === true) return false; // break out
    return true; // continue
  });
  return found;
}

async function checkHeartbeat(c) {
  console.log('checking for alarm state in:', c.category, c.subcategory, c.event);
}

async function deleteTopology(obj) {
  for (let i = 0; i < categories.length; i++) {
    if (categories[i].category === obj.category
      && categories[i].subcategory === obj.subcategory
      && categories[i].event === obj.event) {
      console.log('deleting category:', obj);
      clearInterval(categories[i].intervalID);
      delete categories(i);
      break;
    }
  }
}
async function loadHeartbeatTopology() {
  console.log('loading heartbeats...');
  try {
    const response = await es.search(
      {
        index: esHeartbeatTopologyIndex,
        size: 1000,
        body: { query: { match_all: {} } },
      },
    );
    if (response.body.hits.total.value === 0) {
      console.log('No heartbeats found.');
      return false;
    }
    const { hits } = response.body.hits;
    hits.forEach((hit) => {
      const s = hit._source;
      if (!knownTopology(s)) {
        console.log('cat found:', s, 'createing interval');
        s.intervalID = setInterval(checkHeartbeat, s.interval * 1000, s)[Symbol.toPrimitive]();
        categories.push(s);
      }
    });
    // console.dir(categories);
    return categories;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function init(configuration) {
  config = configuration;
  es = new elasticsearch.Client(config.ES_HOST);
  config.REQUIRED_HEARTBEAT_FIELDS = config.REQUIRED_HEARTBEAT_FIELDS.concat(config.TOPOLOGY_FIELDS);
  config.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS = config.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS.concat(config.TOPOLOGY_FIELDS);
  loadHeartbeatTopology();
}

router.post('/register', jsonParser, async (req, res) => {
  const b = req.body;
  console.log('Adding heartbeat with body:\n', b);
  if (b === undefined || b === null) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }

  config.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS.forEach((v) => {
    console.log(`checking for: ${v}`);
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    }
  });

  Object.entries(b).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
    if (!(config.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS.includes(key))) {
      console.log(`${key} not allowed.\n`);
      delete b[key];
    }
  });

  try {
    const response = await es.index({
      index: esHeartbeatTopologyIndex, body: b, refresh: true,
    });
    console.log('Heartbeat category added.');
    console.debug(response.body);
    await loadHeartbeatTopology();
    res.status(200).send('OK');
    return;
  } catch (err) {
    console.error(err);
    res.status(500).send(err.body);
  }
});

router.patch('/', jsonParser, async (req, res) => {
  const b = req.body;
  console.log('Patching category with body:\n', b);
  if (b === undefined || b === null) {
    res.status(400).send('nothing PATCHEDed.\n');
    return;
  }
  config.TOPOLOGY_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    }
  });

  // add only allowed things to edit source.
  let source = '';
  Object.entries(b).forEach(([key, value]) => {
    // console.log(`${key}: ${value}`);
    if (config.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS.includes(key)) {
      source += `ctx._source["${key}"] = "${value}";`;
    } else {
      console.log(`${key} not allowed.\n`);
    }
  });

  deleteTopology(b);

  await loadHeartbeatTopology();

  // console.log('Check that the category was registered');
  if (knownTopology(b)) {
    console.debug('heartbeat category registered, lets update');
    const updateBody = {
      script: {
        lang: 'painless',
        source,
      },
      query: {
        bool: {
          must: [
            { term: { category: b.category } },
            { term: { subcategory: b.subcategory } },
            { term: { event: b.event } },
          ],
        },
      },
    };

    try {
      const response = await es.updateByQuery({
        index: esHeartbeatTopologyIndex, body: updateBody, refresh: true,
      });
      console.log('Category patched.');
      console.debug(response.body);
      await loadHeartbeatTopology();
      res.status(200).send('OK');
      return;
    } catch (err) {
      console.error(err);
      res.status(500).send(err.body);
    }
  } else {
    res.status(400).send('no such category, subcategory or event allowed.');
  }
});

router.delete('/', async (req, res) => {
  const b = req.body;
  // console.debug('body:', b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  const selector = [];
  config.TOPOLOGY_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    } else {
      const obj = { match: {} };
      obj.match[v] = b[v];
      selector.push(obj);
    }
  });
  console.log('Deleting heartbeat:', selector);
  try {
    const response = await es.deleteByQuery({
      index: esHeartbeatTopologyIndex,
      body: {
        query: {
          bool: {
            must: selector,
          },
        },
      },
      refresh: true,
    });
    if (response.body.deleted > 0) {
      deleteTopology(b);
      await loadHeartbeatTopology();
      res.status(200).send('OK');
    } else {
      console.log(response.body);
      res.status(500).send('No heartbeats like that.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error in deleting heartbeat.');
  }
});

router.post('/', jsonParser, async (req, res) => {
  const b = req.body;
  // console.debug('body:', b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  config.REQUIRED_HEARTBEAT_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    }
  });

  // console.log('Check that only allowed things are in.');
  Object.entries(b).forEach(([key]) => {
    // console.log(`${key}: ${value}`);
    if (!(config.REQUIRED_HEARTBEAT_FIELDS.includes(key)
          || config.OPTIONAL_HEARTBEAT_FIELDS.includes(key))) {
      console.log(`${key} not allowed.\n`);
      delete b[key];
    }
  });

  // console.log('Check that the category was registered');
  if (knownTopology(b)) {
    // console.debug('category registered');
  } else {
    res.status(400).send('no such category, subcategory or event allowed.');
    return;
  }

  b.created_at = new Date().getTime();

  es.index({
    index: esHeartbeatIndex,
    body: b,
  }, (err, response) => {
    if (err) {
      console.error('cant index heartbeat:\n', b, err);
      res.status(500).send(`something went wrong:\n${err}`);
    } else {
      console.log('New heartbeat indexed.');
      // console.debug(response.body);
      res.status(200).send('OK');
    }
  });
});

router.get('/', async (req, res) => {
  res.json(await loadHeartbeatTopology());
});

router.post('/fetch', jsonParser, async (req, res) => {
  const b = req.body;
  // console.log('body:', b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  const selector = [];
  config.TOPOLOGY_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    } else {
      const obj = { match: {} };
      obj.match[v] = b[v];
      selector.push(obj);
    }
  });
  if (b.period === undefined || b.period === null) {
    res.status(400).send('period is required. Just number of hours.\n');
  }

  selector.push({ range: { created_at: { gte: `now-${b.period}h/h` } } });
  console.log('Getting heartbeats:');
  console.dir(selector, { depth: null });

  const heartbeats = [];
  try {
    const response = await es.search(
      {
        index: esHeartbeatIndex,
        size: 1000,
        body: {
          query: {
            bool: {
              must: selector,
            },
          },
        },
      },
    );
    if (response.body.hits.total.value === 0) {
      console.log('No heartbeats found.');
    } else {
      const { hits } = response.body.hits;
      hits.forEach((hit) => {
        const s = hit._source;
        // console.log(s);
        heartbeats.push(s);
      });
    }
  } catch (err) {
    console.error(err);
  }
  res.json(heartbeats);
});

exports.router = router;
exports.loadHeartbeatTopology = loadHeartbeatTopology;
// exports.checkHeartbeats = checkHeartbeats;
exports.init = init;
