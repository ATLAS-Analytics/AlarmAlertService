; (function () {
  'use strict';

  let loaderPage = function () {
    $('.gtco-loader').fadeOut('slow');
  };

  $('#logout_button').click(() => {
    $.get('/logout');
    window.location.replace('/');
  });

  $(() => {
    loaderPage();
  });
}());