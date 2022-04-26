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

function hasTopology(obj) {
  let found = true;
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

function init(configuration) {
  config = configuration;
  es = new elasticsearch.Client(config.ES_HOST);
  config.REQUIRED_HEARTBEAT_FIELDS = config.REQUIRED_HEARTBEAT_FIELDS.concat(config.TOPOLOGY_FIELDS);
  config.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS = config.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS.concat(config.TOPOLOGY_FIELDS);
  // load all active heartbeats
  // create intervals for all of them
  // setInterval(heartbeats.checkHeartbeats, 60000);
}

async function checkHeartbeats() {
  console.log('checking all heartbeats.');
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
    categories.length = 0;
    hits.forEach((hit) => {
      const s = hit._source;
      // console.log(s);
      categories.push(s);
    });
    // console.debug(categories);
    return categories;
  } catch (err) {
    console.error(err);
    return false;
  }
}

router.post('/register', jsonParser, async (req, res) => {
  const b = req.body;
  console.log('Adding heartbeat with body:\n', b);
  if (b === undefined || b === null) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }

  config.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    }
  });

  Object.entries(b).forEach(([key]) => {
    // console.log(`${key}: ${value}`);
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

  await loadHeartbeatTopology();

  // console.log('Check that the category was registered');
  if (hasTopology(b)) {
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
      selector.push({ match: { v: b[v] } });
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
  if (hasTopology(b)) {
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
      console.error('cant index alarm:\n', b, err);
      res.status(500).send(`something went wrong:\n${err}`);
    } else {
      console.log('New alarm indexed.');
      // console.debug(response.body);
      res.status(200).send('OK');
    }
  });
});

router.get('/', async (req, res) => {
  res.json(await loadHeartbeatTopology());
});

exports.router = router;
// exports.checkHeartbeats = checkHeartbeats;
exports.init = init;
