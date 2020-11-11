# Alarm and Alert Service Frontend
REST interface and frontend 

Alarm types are stored as a single document in index *aaas_topology*
* topology - flattened
    {category:{
        subcategory:{

        }
    }}
Alarms are stored in ES index: *aaas_alarms*
* category
* subcategory
* event
* created_at
* tags
* level
* source
* body
* details

### REST API - alarm - implemented
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
* subscriptions - nested?
    .category
    .subcategory
    .event
    .tags
* preferences - flattened
    .vacation ....

### REST API - user
* GET user/:userId - done
* DEL user/:userId - done
* POST user/preferences/:userId - only preferences {vaccation:T/F,...}  - done
* POST user/subscriptions/:userId - accepts json {[{category, subcategory, event, tags}]}

*aaas_alerts*
* created_at
* sent_to
* reason