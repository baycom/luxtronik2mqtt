var util=require('util');
var mqtt=require('mqtt');
const WebSocket = require('ws');
const commandLineArgs = require('command-line-args')
const xml2js = require('xml2js');
var parser = new xml2js.Parser();

const optionDefinitions = [
	{ name: 'path', alias: 'p', type: String, defaultValue: "172.16.0.29" },
	{ name: 'id', alias: 'i', type: String, defaultValue: "luxtronik2" },
	{ name: 'wait', alias: 'w', type: Number, defaultValue: 1000 },
  	{ name: 'debug', alias: 'd', type: Boolean, defaultValue: false },
  	{ name: 'mqtthost', alias: 'm', type: String, defaultValue: "localhost"},
  ];

const options = commandLineArgs(optionDefinitions)

console.log("MQTT host     : " + options.mqtthost);
console.log("MQTT Client ID: " + options.id);

function sendMqtt(data) {
	MQTTclient.publish(options.id + "/" + options.path, JSON.stringify(data), { retain: true });
}
  
var MQTTclient = mqtt.connect("mqtt://"+options.mqtthost,{clientId: options.id});
	MQTTclient.on("connect",function(){
	console.log("MQTT connected");
})

MQTTclient.on("error",function(error){
		console.log("Can't connect" + error);
		process.exit(1)
	});

console.log('ws://'+options.path);
const ws = new WebSocket('ws://' + options.path + ":8214", "Lux_WS");

ws.onerror = function () {
      showMessage('WebSocket error');
      process.exit(-1);
    };


ws.onclose = function () {
      showMessage('WebSocket connection closed');
      ws = null;
      process.exit(-1);
    };
        
ws.onopen = function open() {
	ws.send("LOGIN;0");
	if(options.debug) {
		console.log("login");
	}
};

var id;

function timer(id) {
	ws.send("GET;" + id);
	setTimeout(timer, 10000, id);
}

ws.on('message', function message(data) {
	parser.parseString(data.toString(), (err, result) => {
		if(err) {
			throw err;
		}
		if(options.debug) {
			console.log(util.inspect(result, false, 10));
		}
		if(result["Navigation"]) {
			id=result["Navigation"]["item"][0]["$"]["id"];
			if(options.debug) {
				console.log(id);
			}
			timer(id);
		}
		if(result["Content"] && result["Content"]["item"]) {
			var tree=result["Content"]["item"];
			if(options.debug) {
				console.log(util.inspect(tree, 10));
			}
			var valtree={};
			tree.forEach(element => {
				var topic=element["name"].toString();
				topic = topic.replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/ß/g, 'ss').replace(/ /g, '').replace(/\./g, '').replace(/-/g, '').replace(/:/g, '');
				
				if(options.debug) {
					console.log(topic);
				}
				if( topic == "Temperaturen" || topic == "Eingaenge" || topic == "Ausgaenge" || topic == "Waermemenge" ) {
					var item=element["item"];
					var vals={};
					item.forEach(item => {
						var name=item["name"].toString();
						var value=item["value"].toString();
						name = name.replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/ß/g, 'ss').replace(/ /g, '').replace(/\./g, '').replace(/-/g, '').replace(/:/g, '');
						value = value.replace(/\°C$/g, '').replace(/^Ein$/, '1').replace(/^Aus$/, '0').replace(/V$/,'').replace(/h$/,'').replace(/kW$/,'').replace(/^---/g, '0').replace(/l\/$/g, '');
						if(options.debug) {
							console.log("name: " + name + " value: " + value);
						}
						vals[name]=Number(value);
					});
					valtree[topic]=vals;
				}
			});
			sendMqtt(valtree);
		}
	});
});
