# Alarm and Alert Service Frontend
REST interface and frontend 

Alarms are stored in ES index: 

*aaas_alarms*
* category
* event
* created_at
* tags
* level
* source
* body
* details

- REST API - 
* POST alarm/create (should enforce category and level, make sure there are event, source and body )
* DEL alarm/category
* DEL alarm/event

*aaas_users*
* affiliation
* created_at
* email
* user
* username
* subscriptions [aaas_alarms.category+aaas_alarms.event]
* subscriptions_options []
* preferences

- REST API -
* GET user 
* DEL user
* GET user/preferences
* PUT user/preferences [a,b,c,...]
* GET user/subscriptions
* POST user/subscriptions - accepts json {[{category, event, options}]}
* GET users/category/event - for alerts

*aaas_alerts*
* created_at
* sent_to
* reason