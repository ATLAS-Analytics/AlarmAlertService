const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const bodyParser = require('body-parser');
// const { truncate } = require('lodash');

const esAlarmsIndex = 'aaas_alarms';
const esAlarmTopologyIndex = 'aaas_categories';
let config;
let es;
const categories = [];

const router = express.Router();
const jsonParser = bodyParser.json();

function hasTopology(obj) {
  let found = false;
  categories.forEach((c) => {
    let m = true;
    config.TOPOLOGY_FIELDS.forEach((v) => {
      m = m && c[v] === obj[v];
    });
    found = found || m;
  });
  return found;
}

async function loadAlarmTopology() {
  console.log('loading categories...');
  try {
    const response = await es.search(
      {
        index: esAlarmTopologyIndex,
        size: 1000,
        query: { match_all: {} },
      },
    );
    if (response.hits.total.value === 0) {
      console.log('No categories found.');
      return false;
    }
    const { hits } = response.hits;
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

function init(configuration) {
  config = configuration;
  config.REQUIRED_ALARM_FIELDS = config.REQUIRED_ALARM_FIELDS.concat(config.TOPOLOGY_FIELDS);
  config.REQUIRED_ALARM_TOPOLOGY_FIELDS = config.REQUIRED_ALARM_TOPOLOGY_FIELDS.concat(config.TOPOLOGY_FIELDS);
  es = new elasticsearch.Client(config.ES_HOST);
  loadAlarmTopology();
}

router.post('/', jsonParser, async (req, res) => {
  const b = req.body;
  console.debug('body:', b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  config.REQUIRED_ALARM_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    }
  });

  console.log('Check that only allowed things are in.');
  Object.entries(b).forEach(([key]) => {
    // console.log(`${key}: ${value}`);
    if (!(config.REQUIRED_ALARM_FIELDS.includes(key)
          || config.OPTIONAL_ALARM_FIELDS.includes(key))) {
      console.log(`key: >${key}< not allowed.\n`);
      delete b[key];
    }
  });

  console.log('Check that the category was registered');
  if (hasTopology(b)) {
    console.debug('category registered');
  } else {
    res.status(400).send('no such category, subcategory or event allowed.');
    return;
  }

  b.created_at = new Date().getTime();

  es.index({
    index: esAlarmsIndex,
    body: b,
  }, (err) => {
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

router.get('/categories', async (req, res) => {
  await loadAlarmTopology();
  res.json(categories);
});

router.post('/fetch', jsonParser, async (req, res) => {
  const b = req.body;
  // console.log('body:', b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  if (b.category === undefined || b.category === null) {
    res.status(400).send('category is required.\n');
    return;
  }
  if (b.subcategory === undefined || b.subcategory === null) {
    res.status(400).send('subcategory is required.\n');
    return;
  }
  if (b.event === undefined || b.event === null) {
    res.status(400).send('event is required.\n');
    return;
  }
  if (b.period === undefined || b.period === null) {
    res.status(400).send('period is required. Just number of hours.\n');
    return;
  }
  const {
    category, subcategory, event, period,
  } = b;

  console.log('Getting alarms in:', category, '/', subcategory, '/', event, '/', period);
  const alarms = [];
  try {
    const response = await es.search(
      {
        index: esAlarmsIndex,
        size: 1000,
        query: {
          bool: {
            must: [
              { term: { category } },
              { term: { subcategory } },
              { term: { event } },
              { range: { created_at: { gte: `now-${period}h/h` } } },
            ],
          },
        },
      },
    );
    if (response.hits.total.value === 0) {
      console.log('No alarms found.');
    } else {
      const { hits } = response.hits;
      hits.forEach((hit) => {
        const s = hit._source;
        // console.log(s);
        alarms.push(s);
      });
    }
  } catch (err) {
    console.error(err);
  }
  res.json(alarms);
});

router.post('/category', jsonParser, async (req, res) => {
  const b = req.body;
  console.log('Adding category with body:\n', b);
  if (b === undefined || b === null) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }

  config.REQUIRED_ALARM_TOPOLOGY_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    }
  });

  Object.entries(b).forEach(([key]) => {
    // console.log(`${key}: ${value}`);
    if (!(config.REQUIRED_ALARM_TOPOLOGY_FIELDS.includes(key))) {
      console.log(`${key} not allowed.\n`);
      delete b[key];
    }
  });

  try {
    const response = await es.index({
      index: esAlarmTopologyIndex, body: b, refresh: true,
    });
    console.log('Category added.');
    console.debug(response.body);
    await loadAlarmTopology();
    res.status(200).send('OK');
    return;
  } catch (err) {
    console.error(err);
    res.status(500).send(err.body);
  }
});

router.patch('/category', jsonParser, async (req, res) => {
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
    if (config.REQUIRED_ALARM_TOPOLOGY_FIELDS.includes(key)) {
      source += `ctx._source["${key}"] = "${value}";`;
    } else {
      console.log(`${key} not allowed.\n`);
    }
  });

  await loadAlarmTopology();

  // console.log('Check that the category was registered');
  if (hasTopology(b)) {
    console.debug('category registered, lets update');
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
        index: esAlarmTopologyIndex, body: updateBody, refresh: true,
      });
      console.log('Category patched.');
      console.debug(response.body);
      await loadAlarmTopology();
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
  console.log('Deleting alarm category:', selector);
  try {
    const response = await es.deleteByQuery({
      index: esAlarmTopologyIndex,
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
      await loadAlarmTopology();
      res.status(200).send('OK');
    } else {
      console.log(response.body);
      res.status(500).send('No alarms in that category.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error in deleting alarm category.');
  }
});

exports.router = router;
exports.init = init;
exports.loadAlarmTopology = loadAlarmTopology;
