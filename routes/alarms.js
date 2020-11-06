const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const bodyParser = require('body-parser');

const esAlarmsIndex = 'aaas_alarms';
let config;
let es;
let allowedFields;

const router = express.Router();
const jsonParser = bodyParser.json();

function init(configuration) {
  config = configuration;
  es = new elasticsearch.Client(config.ES_HOST);
  allowedFields = config.ALLOWED_FIELDS + ['category', 'subcategory', 'event'];
}

async function loadTopology() {
  console.log('loading topology...');
  try {
    const response = await es.search({
      index: esAlarmsIndex,
      body: {
        size: 0,
        aggs: {
          c: {
            terms: { field: 'category' },
            aggs: {
              sc: {
                terms: { field: 'subcategory' },
                aggs: {
                  e: {
                    terms: { field: 'event' },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (response.body.hits.total.value === 0) {
      console.log('No events found.');
      return false;
    }
    const obj = response.body.aggregations;
    // console.debug(obj);
    const to = {};
    obj.c.buckets.forEach((cat) => {
      // console.log(cat.key);
      to[cat.key] = {};
      cat.sc.buckets.forEach((sc) => {
        // console.log(sc.key);
        to[cat.key][sc.key] = {};
        sc.e.buckets.forEach((ev) => {
          // console.log(ev.key);
          to[cat.key][sc.key][ev.key] = ev.doc_count;
        });
      });
    });
    console.log(to);
    return to;
  } catch (err) {
    console.error(err);
    return false;
  }
}

router.post('/', jsonParser, async (req, res) => {
  const b = req.body;
  console.log('body:', b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.');
  }
  if (b.category === undefined || b.category === null) {
    res.status(400).send('category is required.');
  }
  if (b.subcategory === undefined || b.subcategory === null) {
    res.status(400).send('subcategory is required.');
  }
  if (b.event === undefined || b.event === null) {
    res.status(400).send('event is required.');
  }

  // console.log('Check that only allowed things are in.');

  Object.entries(b).forEach(([key, value]) => {
    // console.log(`${key}: ${value}`);
    if (allowedFields.indexOf(key) < 0) {
      console.log(`${key} not allowed.`);
      res.status(400).send(`key ${key} not allowed.`);
    }
  });

  b.created_at = new Date().getTime();

  es.index({
    index: esAlarmsIndex,
    body: b,
  }, (err, response) => {
    if (err) {
      console.error('cant index alarm:\n', err);
      res.status(500).send(`something went wrong:\n${err}`);
    }
    console.log('New alarm indexed.');
    // console.debug(response.body);
    res.status(200).send('OK');
  });
});

router.get('/topology', async (req, res) => {
  res.json(await loadTopology());
});

router.delete('/:category', (req, res) => {
  const { category } = req.params;
  console.log('Deleting alarms in category:', category);
  es.deleteByQuery({
    index: esAlarmsIndex,
    body: { query: { match: { category } } },
  },
  (err, response) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error in deleting category.');
    } else if (response.body.deleted === 1) {
      res.status(200).send('OK');
    } else {
      console.log(response.body);
      res.status(500).send('No alarms in that category.');
    }
  });
});

router.delete('/:category/:subcategory', (req, res) => {
  const { category, subcategory } = req.params;
  console.log('Deleting alarms in:', category, '/', subcategory);
  es.deleteByQuery({
    index: esAlarmsIndex,
    body: {
      query: {
        bool: {
          must: [
            { match: { category } },
            { match: { subcategory } },
          ],
        },
      },
    },
  },
  (err, response) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error in deleting subcategory.');
    } else if (response.body.deleted === 1) {
      res.status(200).send('OK');
    } else {
      console.log(response.body);
      res.status(500).send('No alarms in that subcategory.');
    }
  });
});

router.delete('/:category/:subcategory/:event', (req, res) => {
  const { category, subcategory, event } = req.params;
  console.log('Deleting alarms in:', category, '/', subcategory, '/', event);
  es.deleteByQuery({
    index: esAlarmsIndex,
    body: {
      query: {
        bool: {
          must: [
            { match: { category } },
            { match: { subcategory } },
            { match: { event } },
          ],
        },
      },
    },
  },
  (err, response) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error in deleting event.');
    } else if (response.body.deleted === 1) {
      res.status(200).send('OK');
    } else {
      console.log(response.body);
      res.status(500).send('No alarms in that event.');
    }
  });
});

exports.router = router;
exports.init = init;
