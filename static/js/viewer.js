let qCategory;
let qSubcategory;
let qEvent;
let table;
const queryString = window.location.search;
console.log('query string:', queryString);

if (queryString.length > 0) {
  try {
    const urlParams = new URLSearchParams(queryString);
    qCategory = urlParams.get('category');
    qSubcategory = urlParams.get('subcategory');
    qEvent = urlParams.get('event');
    console.log(qCategory, qSubcategory, qEvent);
  } catch (error) {
    console.error('bad query string.');
  }
}

function updateForm(cat, subcat, event) {
  let src = 'https://atlas-kibana.mwt2.org:5601/s/aaas/app/visualize?auth_provider_hint=anonymous1#';
  src += '/edit/7fe2406a-a989-5b0f-bdb1-7d90421f8b1c?embed=true';
  let query = '&_g=(time:(from:now-7d,to:now))';
  query += "&_a=(query:(language:kuery,query:'";
  query += `category:"${cat}"`;
  query += ` AND subcategory:"${subcat}"`;
  query += ` AND event:"${event}"`;
  query += "'))";
  const fsrc = src + encodeURIComponent(query);
  console.log(`src:${fsrc}`);
  $('#alarmsInTime').attr('src', fsrc);
}

function createCascade() {
  $('#cascade').cascadingDropdown({
    selectBoxes: [{
      selector: '#step1',
      source: function(request, response) {
        $.getJSON('/alarm/categories', request, function(data) {
            var first=true;
            var uniqueCategories=[];
            var seen=[];
            $.each(data, function(index,item){
                if (seen.includes(item.category)){
                    return true;
                }
                uniqueCategories.push({
                    label: item.category,
                    value: item.category,
                    selected: first
                });
                seen.push(item.category);
                first=false;
            });
            response(uniqueCategories);
        });
      }
    },
    {
                selector: '#step2',
                requires: ['#step1'],
                source: function(request, response) {
                    $.getJSON('/alarm/categories', request, function(data) {
                        var first=true;
                        var uniqueSubCategories=[];
                        var seen=[];
                        $.each(data, function(index,item){
                            if(item.category!==$('#step1').val()){
                                return true;
                            }
                            if (seen.includes(item.subcategory)){
                                return true;
                            }
                            uniqueSubCategories.push({
                                label: item.subcategory,
                                value: item.subcategory,
                                selected: first
                            });
                            seen.push(item.subcategory);
                            first=false;
                        });
                        response(uniqueSubCategories);
                    });
                }
            },
            {
                selector: '#step3',
                requires: ['#step1', '#step2'],
                requireAll: true,
                source: function(request, response) {
                    $.getJSON('/alarm/categories', request, function(data) {
                        var first=true;
                        var uniqueEvents=[];
                        $.each(data, function(index,item){
                            if(item.category!==$('#step1').val()){
                                return true;
                            }
                            if(item.subcategory!==$('#step2').val()){
                                return true;
                            }
                            uniqueEvents.push({
                                label: item.event,
                                value: item.event,
                                selected: first
                            });
                            first=false;
                        });
                        response(uniqueEvents);
                    });
                },
                onChange: function(event, value, requiredValues, requirementsMet){
                    if (requirementsMet){
                        qCategory = requiredValues.category;
                        qSubcategory =requiredValues.subcategory;
                        qEvent = value;
                        updateForm(qCategory, qSubcategory, qEvent);
                        if (table===undefined){
                            createTable();
                        } else {
                            table.ajax.reload();
                        }
                    }
                }
            }
        ]
    });
}

function createTable() {
  table = $('#alarms_table').DataTable({
    paging: true,
    searching: true,
    ajax:{
      type: 'POST',
      url: '/alarm/fetch',
      contentType: 'application/json',
      data: function ( d ) {
        return JSON.stringify({
          category: qCategory,
          subcategory: qSubcategory,
          event: qEvent,
          period: 24
        });
      },
      dataSrc: '',
      error(xhr, textStatus, errorThrown) {
        alert(`Error code:${xhr.status}.${xhr.responseText}`);
      }
    },
        columns: [
            {title:'Created', data: 'created_at',
                render: function (data, type, row){
                    var d=new Date(data);
                    return d.toISOString().substr(0,19).replace('T',' ');
                }
            },
            {title:'Body', data: 'body'},
            {title:'Tags', data: 'tags'},
            //- ,render: function (data, type, row){
                //- return data.replace(',',' ');
            //- }},
            {title:'Source', data: 'source',
                render: function (data, type, row){
                    if (data === undefined){ return 'empty'}
                    sourc = JSON.stringify(data);
                    sour=sourc.substr(1,sourc.length-2).replaceAll(',',' ');
                    return sour;
                }
            },
            {title:"Annotation", data: 'annotation',
                render: function (data, type, row) {
                        //- console.log('data:',data,'row:',row );
                        if (row.annotation === undefined){row.annotation = '';}
                        return '<input class="form-control annInput" name="Annotations" type="text" value = ' + row.annotation + ' >';
                    }
            },
        ],

        //- "drawCallback": function( settings ) {
        //-   $(".annInput").on("change",function(){
        //-        var $row = $(this).parents("tr");
        //-        var rowData = table.row($row).data();
        //-        rowData.tags = $(this).val();
        //-        console.log('row changed', rowData);
        //-   })
        //- },
    });
}

if (qCategory === undefined) {
  createCascade();
}
else {
  updateForm(qCategory, qSubcategory, qEvent);
  $('#cascade').hide();
  createTable();
}
