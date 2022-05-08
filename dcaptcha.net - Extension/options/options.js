/*
 * Show current configurations
 */
Config.getAll().then(config => {

    var form = $("#config-form");

    form.find("input[name=api_key]").val(config.api_key);

    for (let key in config) {
        let el = $("[name=" + key + "]");

        let val = config[key];

        if (!el.length) continue;

        if (el.is("[type=text]")) {
            el.val(val);
        }

        if (el.is("select")) {
            el.val(val);
        }

        if (el.is("[type=checkbox]")) {
            el.prop("checked", val);
        }

        el.closest(".custom-select").find(".custom-select-value").text(val);
    }

    $(".container").attr("style", "");

});


/*
 * Save configurations
 */
$("#config-form").on("keyup change", "input,select", function() {
    let key = $(this).attr("name");
    let value = $(this).val();

    if ($(this).is("[type=checkbox]")) {
        value = $(this).is(":checked");
    }

    let dataType = $(this).attr("data-type");

    if (dataType == 'int') value = parseInt(value) || 0;
    if (dataType == 'float') value = parseFloat(value) || 0.0;

    let config = {};
    config[key] = value;

    Config.set(config);
});



/*
 * BACKGROUND COMMUNICATION
 */
var connectBtn = $("#connect");

connectBtn.click(function(e) {
    e.preventDefault();

    connectBtn.attr("data-text", connectBtn.text());

    connectBtn.html(`<img src="/assets/images/loader_dark.gif">`);

    let apiKey = $("input[name=apiKey]").val();

    background.postMessage({action: "login", apiKey});
});

var background = chrome.runtime.connect({name: "popup"});

background.onMessage.addListener(function(msg) {

    if (msg.action == "login") {
        if (msg.error === undefined) {
            alert(chrome.i18n.getMessage("accountSuccessfullyConnected"));
        } else {
            alert(msg.error);
        }

        connectBtn.text(connectBtn.attr("data-text"));
    }

});




/*
 * CUSTOM SELECT
 */
$(".custom-select-label").click(function(e) {
    let p = $(this).parent();
    $(".custom-select").not($(this).parent()[0]).removeClass("open");
    p.toggleClass("open");
});

$(".custom-select-dropdown-field button").click(function(e) {
    e.preventDefault();

    let p = $(this).closest(".custom-select");

    let v = $(this).parent().find("input").val();

    p.find(".custom-select-value").text(v);
    p.removeClass("open");
});

$(".custom-select-dropdown-value").click(function() {
    $(this).parent().find("input").val($(this).attr("data-value")).change();
    $(this).parent().find("button").click();
});
