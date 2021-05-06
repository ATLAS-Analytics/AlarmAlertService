; (function () {
  'use strict';

  let dropdown = function () {
    $('.has-dropdown').mouseenter(function () {
      let $this = $(this);
      $this
        .find('.dropdown')
        .css('display', 'block')
        .addClass('animated-fast fadeInUpMenu');
    }).mouseleave(function () {
      let $this = $(this);

      $this
        .find('.dropdown')
        .css('display', 'none')
        .removeClass('animated-fast fadeInUpMenu');
    });
  };

  let tabs = function () {
    // Auto adjust height
    $('.gtco-tab-content-wrap').css('height', 0);
    let autoHeight = function () {
      setTimeout(function () {
        let tabContentWrap = $('.gtco-tab-content-wrap'),
          tabHeight = $('.gtco-tab-nav').outerHeight(),
          formActiveHeight = $('.tab-content.active').outerHeight(),
          totalHeight = parseInt(tabHeight + formActiveHeight + 90);

        tabContentWrap.css('height', totalHeight);

        $(window).resize(function () {
          let tabContentWrap = $('.gtco-tab-content-wrap'),
            tabHeight = $('.gtco-tab-nav').outerHeight(),
            formActiveHeight = $('.tab-content.active').outerHeight(),
            totalHeight = parseInt(tabHeight + formActiveHeight + 90);

          tabContentWrap.css('height', totalHeight);
        });
      }, 100);
    };

    autoHeight();


    // Click tab menu
    $('.gtco-tab-nav a').on('click', function (event) {
      let $this = $(this);
      let tab = $this.data('tab');

      $('.tab-content')
        .addClass('animated-fast fadeOutDown');

      $('.tab-content')
        .removeClass('active');

      $('.gtco-tab-nav li').removeClass('active');

      $this
        .closest('li')
        .addClass('active');

      $this
        .closest('.gtco-tabs')
        .find('.tab-content[data-tab-content="' + tab + '"]')
        .removeClass('animated-fast fadeOutDown')
        .addClass('animated-fast active fadeIn');

      autoHeight();
      event.preventDefault();
    });
  };

  let loaderPage = function () {
    $('.gtco-loader').fadeOut('slow');
  };

  $('#logout_button').click(() => {
    $.get('/logout');
    window.location.replace('/');
  });

  $(() => {
    dropdown();
    tabs();
    loaderPage();
  });
}());