* add Jira ticket creation option
* add alarm link to emails
* add time selector to viewer and/or link to kibana.
* add storing annotations of alarms
* add examples to create alert using curl and python. 
* before updating preferences, subscriptions, check that userid exists.
* move away from requests and use node-fetch
"""
const fetch = require("node-fetch");
const url = "https://jsonplaceholder.typicode.com/posts/1";

const getData = async url => {
  try {
    const response = await fetch(url);
    const json = await response.json();
    console.log(json);
  } catch (error) {
    console.log(error);
  }
};

getData(url);
"""