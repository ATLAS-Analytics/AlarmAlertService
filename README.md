# Alarm and Alert Service Frontend
REST interface and frontend 

Alarms are stored in ES index: 

*aaas_alarms*
* category
* subcategory
* event
* created_at
* tags
* level
* source
* body
* details

### REST API - alarm
* POST alarm/ (should enforce category and level, make sure there are event, source and body )
* GET alarm/topology (returns dictionary tree of category, subcategory, event)
* DEL alarm/:category
* DEL alarm/:category/:subcategory
* DEL alarm/:category/:subcategory/:event

*aaas_users*
* affiliation
* created_at
* email
* user
* username
* subscriptions [aaas_alarms.category+aaas_alarms.event]
* subscriptions_options []
* preferences

### REST API - user
* GET user/:userId - done
* DEL user/:userId - done
* GET user/preferences
* PUT user/preferences [a,b,c,...]
* GET user/subscriptions
* POST user/subscriptions - accepts json {[{category, event, options}]}
* GET user/category/event - for alerts

*aaas_alerts*
* created_at
* sent_to
* reason