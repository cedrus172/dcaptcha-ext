window.location = "javascript: (" + function () {

    /*
     * Create widgets container
     */
    let widgetsList = document.createElement("captcha-widgets");
    document.head.appendChild(widgetsList);

    /*
     * Widgets container helper
     */
    window.registerCaptchaWidget = function(widgetInfo) {
        let widget = document.createElement("captcha-widget");

        for (let k in widgetInfo) {
            widget.dataset[k] = widgetInfo[k];
        }

        widgetsList.appendChild(widget);
    };

    /*
     * Widgets container helper
     */
    window.isCaptchaWidgetRegistered = function(captchaType, widgetId) {
        let widgets = widgetsList.children;

        for (let i = 0; i < widgets.length; i++) {
            if (widgets[i].dataset.captchaType !== captchaType) continue;
            if (widgets[i].dataset.widgetId !== widgetId + '') continue;
            return true;
        }

        return false;
    };

    /*
     * Widgets container helper
     */
    window.resetCaptchaWidget = function(captchaType, widgetId) {
        let widgets = widgetsList.children;

        for (let i = 0; i < widgets.length; i++) {
            let wd = widgets[i].dataset;

            if (wd.captchaType != captchaType) continue;
            if (wd.widgetId != widgetId) continue;

            wd.reset = true; break;
        }
    };

    /*
     * Widgets container helper
     */
    window.getCaptchaWidgetButton = function(captchaType, widgetId) {
        return document.querySelector(".captcha-solver[data-captcha-type='" + captchaType + "'][data-widget-id='" + widgetId + "']");
    };

} + ")()";




/*
 * Captcha Processors Repository
 */
var CaptchaProcessors = {

    list: {},

    register: function(processor) {
        this.list[processor.captchaType] = processor;
    },

    get: function(captchaType) {
        return this.list[captchaType];
    },

};




/*
 * Main loop.
 * It iterates over found captcha widgets and processes them.
 */
let CAPTCHA_WIDGETS_LOOP = setInterval(function() {
    Config.getAll().then(config => {
        if (!config.isPluginEnabled) return;
        if (config.apiKey === null) return;

        $("head").find("captcha-widget").each(function () {
            let widget = $(this);
            let widgetInfo = prepareWidgetInfo(widget[0].dataset);

            if (widgetInfo.reset) {
                getSolverButton(widgetInfo.captchaType, widgetInfo.widgetId).remove();
                widget.removeAttr("data-loaded");
                widget.removeAttr("data-reset");
            }

            if (widgetInfo.loaded) return;

            let processor = CaptchaProcessors.get(widgetInfo.captchaType);

            if (processor.canBeProcessed(widgetInfo, config)) {
                let button = createSolverButton(widgetInfo.captchaType, widgetInfo.widgetId);
                processor.attachButton(widgetInfo, config, button);
                widget[0].dataset.loaded = true;
            }
        });

    });
}, 2000);





/*
 * Background communication
 */
var background = chrome.runtime.connect({name: "content"});

background.onMessage.addListener(function(msg) {

    if (msg.action == "solve") {
        if (msg.request.messageId) {
            return respondToWebPageMessage(msg);
        }

        let button = getSolverButton(msg.request.captchaType, msg.request.widgetId);

        if (msg.error === undefined) {
            changeSolverButtonState(button,"solved", chrome.i18n.getMessage("solved"));
            doActionsOnSuccess(msg);
        } else {
            changeSolverButtonState(button,"error", msg.error);
            tryAgain(button);
        }
    }

});

background.onDisconnect.addListener(function(port) {
    clearInterval(CAPTCHA_WIDGETS_LOOP);
});



function doActionsOnSuccess(msg) {
    let widget = getWidgetInfo(msg.request.captchaType, msg.request.widgetId);
    let processor = CaptchaProcessors.get(msg.request.captchaType);

    processor.onSolved(widget, msg.response.code);

    Config.getAll().then(config => {
        let callback = processor.getCallback(widget);

        if (callback) {
            location.href = `javascript: window["${callback}"]("${msg.response.code}")`;
        }

        if (config.autoSubmitForms === true) {
            let timeout = parseInt(config.submitFormsDelay) * 1000;

            setTimeout(function() {
                processor.getForm(widget).submit();
            }, timeout);
        }
    });
}

function tryAgain(button) {
    Config.getAll().then(config => {
        let countErrors = parseInt(button[0].dataset.countErrors || 0);

        if (config.repeatOnErrorTimes >= countErrors) {
            setTimeout(function() {
                button.click();
            }, config.repeatOnErrorDelay * 1000);
        }
    });
}

function attachProxyParams(params, config) {
    if (!config.useProxy) return;

    let proxy = config.proxy.trim();

    if (!proxy.length) return;

    params.proxy = {
        type: config.proxytype,
        uri: proxy,
    };
}


/*
 * Solver button
 */
function createSolverButton(captchaType, widgetId) {
    let button = $(`
        <div class="captcha-solver" data-state="ready" data-captcha-type="${captchaType}" data-widget-id="${widgetId}">
            <div class="captcha-solver-image">
                <img src="${chrome.extension.getURL("assets/images/icon_32.png")}">
            </div>
            <div class="captcha-solver-info">${chrome.i18n.getMessage("solveWithDcaptcha")}</div>
        </div>
    `);

    button.click(function() {
        if (!["ready", "error"].includes(button.attr("data-state"))) return;

        if (button[0].dataset.countErrors && button[0].dataset.disposable) {
            return changeSolverButtonState(button, "error", "EXPIRED");
        }

        changeSolverButtonState(button, "solving", chrome.i18n.getMessage("solving"));

        let widget = getWidgetInfo(captchaType, widgetId);

        Config.getAll().then(function(config) {
            let params = CaptchaProcessors.get(captchaType).getParams(widget, config);
            attachProxyParams(params, config);

            background.postMessage({
                action: "solve",
                captchaType: captchaType,
                widgetId: widgetId,
                params: params,
            });
        });
    });

    return button;
}

function changeSolverButtonState(button, state, message) {
    button.attr("data-state", state)
    button.find(".captcha-solver-info").text(message);

    if (state === "error") {
        button[0].dataset.countErrors = parseInt(button[0].dataset.countErrors || 0) + 1
    }
}

function getSolverButton(captchaType, widgetId) {
    return $(".captcha-solver[data-captcha-type=" + captchaType + "][data-widget-id=" + widgetId + "]");
}

function getWidgetInfo(captchaType, widgetId) {
    let widget = $("head").find("captcha-widget[data-captcha-type=" + captchaType +"][data-widget-id=" + widgetId + "]");

    if (!widget.length) return null;

    return prepareWidgetInfo(widget[0].dataset);
}

function prepareWidgetInfo(dataset) {
    let w = {};

    for (let k in dataset) {
        w[k] = dataset[k];

        if (w[k] === "null")  w[k] = null;
        if (w[k] === "false") w[k] = false;
        if (w[k] === "true")  w[k] = true;
    }

    return w;
}


/*
 * Communication with web page
 */
window.location = "javascript: window.sendMsgToSolverCS = " + `function(action, data) {
    return new Promise(function(resolve, reject) {
        let messages = document.querySelector("body > solver-ext-messages");
        
        if (!messages) {
            messages = document.createElement("solver-ext-messages");
            messages.style.display = "none";
            document.body.appendChild(messages);
        }
        
        let message = document.createElement("solver-ext-message");
        message.dataset.action = action;
        message.dataset.messageId = Date.now();
        if (data) message.dataset.data = encodeURIComponent(JSON.stringify(data));
        messages.appendChild(message);
        
        let waitResponseInterval = setInterval(function() {
            if (message.dataset.response) {
                try {
                    let data = JSON.parse(decodeURIComponent(message.dataset.response));
                    
                    if (data.error) {
                        reject(new Error(data.error));
                    } else {
                        resolve(data);
                    }
                } catch (e) {
                    reject(new Error("Cannot parse message response"));
                }
                
                clearTimeout(waitResponseInterval);
                message.remove();
                if (!messages.childNodes.length) messages.remove();
            }
        }, 200);
    });
};`;

let webPageMsgInterval = setInterval(function() {
    $("body > solver-ext-messages").children().each(function() {
        let msg = $(this)[0];

        if (!msg.dataset.received) {
            msg.dataset.received = true;

            if (msg.dataset.action === "getConfig") {
                Config.getAll().then(config => {
                    setWebPageMessageResponse(msg, config);
                });
            } else if (msg.dataset.action === "solve") {
                let data = JSON.parse(decodeURIComponent(msg.dataset.data));

                background.postMessage({
                    action: "solve",
                    captchaType: data.captchaType,
                    widgetId: data.widgetId,
                    params: data.params,
                    messageId: msg.dataset.messageId,
                });
            } else if (msg.dataset.action === "getRecaptchaV3InterceptorInfo") {
                setWebPageMessageResponse(msg, {
                    extId: chrome.runtime.id,
                    i18n: {
                        solving: chrome.i18n.getMessage("solving"),
                        solved: chrome.i18n.getMessage("solved"),
                    }
                });
            } else {
                setWebPageMessageResponse(msg, {error: "unknown_action"});
            }
        }
    });
}, 200);

function respondToWebPageMessage(msg) {
    let message = $("body > solver-ext-messages > solver-ext-message[data-message-id=" + msg.request.messageId + "]");

    if (!message.length) return;

    if (msg.error) {
        setWebPageMessageResponse(message[0], {error: msg.error});
    } else {
        setWebPageMessageResponse(message[0], {response: msg.response.code});
    }
}

function setWebPageMessageResponse(message, response) {
    message.dataset.response = encodeURIComponent(JSON.stringify(response));
}
