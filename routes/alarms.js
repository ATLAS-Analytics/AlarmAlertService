const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const bodyParser = require('body-parser');

const esAlarmsIndex = 'aaas_alarms';
const esCategoriesIndex = 'aaas_categories';
let config;
let es;
let allowedFields;
const categories = [];
const cats = [];

const router = express.Router();
const jsonParser = bodyParser.json();

async function loadCategories() {
  console.log('loading categories...');
  try {
    const response = await es.search(
      { index: esCategoriesIndex, body: { query: { match_all: {} } } },
    );
    if (response.body.hits.total.value === 0) {
      console.log('No categories found.');
      return false;
    }
    const { hits } = response.body.hits;
    categories.length = 0;
    cats.length = 0;
    hits.forEach((hit) => {
      const s = hit._source;
      // console.log(s);
      categories.push(s);
      cats.push(`${s.category}_${s.subcategory}_${s.event}`);
    });

    console.debug(categories);
    console.debug(cats);
    return categories;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function init(configuration) {
  config = configuration;
  es = new elasticsearch.Client(config.ES_HOST);
  allowedFields = config.ALLOWED_FIELDS + ['category', 'subcategory', 'event'];
  loadCategories();
}

router.post('/', jsonParser, async (req, res) => {
  const b = req.body;
  console.log('body:', b);
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

  // console.log('Check that only allowed things are in.');
  let disallowed = '';
  Object.entries(b).forEach(([key, value]) => {
    // console.log(`${key}: ${value}`);
    if (allowedFields.indexOf(key) < 0) {
      console.log(`${key} not allowed.\n`);
      disallowed += `${key} not allowed.\n`;
    }
  });
  if (disallowed.length > 0) {
    res.status(400).send(disallowed);
    return;
  }

  // console.log('Check that the category was registered');
  if (cats.includes(`${b.category}_${b.subcategory}_${b.event}`)) {
    console.log('category registered');
  } else {
    res.status(400).send('no such category, subcategory or event allowed.');
    return;
  }

  b.created_at = new Date().getTime();

  es.index({
    index: esAlarmsIndex,
    body: b,
  }, (err, response) => {
    if (err) {
      console.error('cant index alarm:\n', err);
      res.status(500).send(`something went wrong:\n${err}`);
    } else {
      console.log('New alarm indexed.');
      // console.debug(response.body);
      res.status(200).send('OK');
    }
  });
});

router.get('/categories', async (req, res) => {
  await loadCategories();
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
  const {category, subcategory, event, period} = b;

  console.log('Getting alarms in:', category, '/', subcategory, '/', event, '/', period);
  const alarms = [];
  try {
    const response = await es.search(
      {
        index: esAlarmsIndex,
        body: {
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
      },
    );
    if (response.body.hits.total.value === 0) {
      console.log('No alarms found.');
    } else {
      const { hits } = response.body.hits;
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
  if (b === undefined || b === null || Object.keys(b).length !== 4) {
    res.status(400).send('nothing POSTed or data incomplete.\n');
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
  if (b.description === undefined || b.description === null) {
    res.status(400).send('description is required.\n');
    return;
  }

  try {
    const response = await es.index({
      index: esCategoriesIndex, body: b, refresh: true,
    });
    console.log('Category added.');
    console.debug(response.body);
    await loadCategories();
    res.status(200).send('OK');
    return;
  } catch (err) {
    console.error(err);
    res.status(500).send(err.body);
  }
});

router.delete('/:category', async (req, res) => {
  const { category } = req.params;
  console.log('Deleting alarms in category:', category);
  try {
    const response = await es.deleteByQuery({
      index: esCategoriesIndex,
      body: { query: { match: { category } } },
      refresh: true,
    });
    if (response.body.deleted > 0) {
      await loadCategories();
      res.status(200).send('OK');
    } else {
      console.log(response.body);
      res.status(500).send('No alarms in that category.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error in deleting category.');
  }
});

router.delete('/:category/:subcategory', async (req, res) => {
  const { category, subcategory } = req.params;
  console.log('Deleting alarms in:', category, '/', subcategory);
  try {
    const response = await es.deleteByQuery({
      index: esCategoriesIndex,
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
      refresh: true,
    });
    if (response.body.deleted > 0) {
      await loadCategories();
      res.status(200).send('OK');
    } else {
      console.log(response.body);
      res.status(500).send('No alarms in that subcategory.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error in deleting subcategory.');
  }
});

router.delete('/:category/:subcategory/:event', async (req, res) => {
  const { category, subcategory, event } = req.params;
  console.log('Deleting alarms in:', category, '/', subcategory, '/', event);
  try {
    const response = await es.deleteByQuery({
      index: esCategoriesIndex,
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
      refresh: true,
    });
    if (response.body.deleted > 0) {
      await loadCategories();
      res.status(200).send('OK');
    } else {
      console.log(response.body);
      res.status(500).send('No alarms in that event.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error in deleting event.');
  }
});

exports.router = router;
exports.init = init;
exports.loadCategories = loadCategories;
