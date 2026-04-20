import jQuery from 'jquery';

window.jQuery = jQuery;
window.$ = jQuery;
global.jQuery = jQuery;
import {logger} from './logger';
// const bootstrap = require('bootstrap');
// logger.log(bootstrap)

(function ($) {
  $.fn.menumaker = function (options) {
    const cssmenu = $(this),
      settings = $.extend(
        {
          format: 'dropdown',
          sticky: false,
        },
        options
      );
    return this.each(function () {
      $(this)
        .find('.button')
        .on('click', function () {
          $(this).toggleClass('menu-opened');
          const mainmenu = $(this).next('ul');
          if (mainmenu.hasClass('open')) {
            mainmenu.slideToggle().removeClass('open');
          } else {
            mainmenu.slideToggle().addClass('open');
            if (settings.format === 'dropdown') {
              mainmenu.find('ul').show();
            }
          }
        });
      cssmenu.find('li ul').parent().addClass('has-sub');
      const multiTg = function () {
        cssmenu
          .find('.has-sub')
          .prepend('<span className="submenu-button"></span>');
        cssmenu.find('.submenu-button').on('click', function () {
          $(this).toggleClass('submenu-opened');
          if ($(this).siblings('ul').hasClass('open')) {
            $(this).siblings('ul').removeClass('open').slideToggle();
          } else {
            $(this).siblings('ul').addClass('open').slideToggle();
          }
        });
      };
      if (settings.format === 'multitoggle') multiTg();
      else cssmenu.addClass('dropdown');
      if (settings.sticky === true) cssmenu.css('position', 'fixed');
      const resizeFix = function () {
        const mediasize = 1000;
        if ($(window).width() > mediasize) {
          cssmenu.find('ul').show();
        }
        if ($(window).width() <= mediasize) {
          cssmenu.find('ul').hide().removeClass('open');
        }
      };
      resizeFix();
      return $(window).on('resize', resizeFix);
    });
  };
})(jQuery);

(function ($) {
  $(document).ready(function () {
    $('#cssmenu').menumaker({
      format: 'multitoggle',
    });
  });
})(jQuery);
