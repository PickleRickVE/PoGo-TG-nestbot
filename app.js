// libraries
const schedule = require('node-schedule');
const axios = require('axios');
const fs = require('fs');
const turf = require('turf');
const mysql = require('mysql');

// config
const config = require('./config')
const botToken = config.botToken;
const chatId = config.channelID;
const pool = mysql.createPool(config.manualdb);
const pool2 = mysql.createPool(config.rdmdb);

// main
async function main() {
    let favNests = config.favNests;
    let lastMigrationDate = lastNestChange();
    let expirationDate = new Date(lastMigrationDate * 1000 + 1209600000);
    let expirationDateString = ('0' + expirationDate.getDate()).slice(-2) + "." + ('0' + (expirationDate.getMonth() + 1)).slice(-2) + "." + expirationDate.getFullYear();
    let logTime = new Date();
    let h = logTime.getHours()<10 ? '0' + logTime.getHours() : logTime.getHours();
    let m = logTime.getMinutes()<10 ? '0' + logTime.getMinutes() : logTime.getMinutes();
    let s = logTime.getSeconds()<10 ? '0' + logTime.getSeconds() : logTime.getSeconds();
    let time = h + ':' + m + ':' + s;
    let nests = [];
    let nestsTemp = [];
    let spawnReport = [];

    console.log("\nNEST: POKEMON_ID")

    // get nests from manualdb
    for await (const element of favNests) {
        let nest = await getNest(element)
        .then(function(results){
            return results[0];
        })
        .catch(function(err){
            console.log("Promise rejection error: "+err);
        });
        nests.push(nest);
    }
    
    // get spawnpoints for each nest from rdmdb
    for await (const element of nests) {
        let path = JSON.parse(element.polygon_path);
        let poly = turf.flip(turf.polygon(path));
        let nestBounds = turf.bbox(poly);
        let spawnpoints = await getSpawnpoints(nestBounds)
        .then(function(results){
            return results;
        })
        .catch(function(err){
            console.log("Promise rejection error: "+err);
        });
        element.spawnpoints = spawnpoints;
        nestsTemp.push(element);
    }
    nests = nestsTemp;
    nestsTemp = [];

    // get spawns per nest and update manualdb
    for await (const element of nests) {
        let idList = [];
        element.spawnpoints.forEach(sp => {
            let point = turf.point([sp.lat, sp.lon]);
            let path = JSON.parse(element.polygon_path);
            let poly = turf.flip(turf.polygon(path));
            if (turf.inside(point, poly)) {
                idList.push(sp.id.toString())
            }
        });
        let idListString = JSON.stringify(idList).slice(1,-1);
        let spawnList = await getSpawns(idListString, lastMigrationDate)
        .then(function(results){
            return results;
        })
        .catch(function(err){
            console.log("Promise rejection error: "+err);
        });
        if (spawnList[0] != undefined) {
            console.dir(element.name + ": " + spawnList[0].pokemon_id);
            spawnReport.push({name: element.name, nestPokemon: spawnList[0].pokemon_id, lat: element.lat, lon: element.lon});
            let updateTime = logTime / 1000;
            let update = await updateMdb (element.name, spawnList[0].pokemon_id, updateTime, spawnList[0].count)
            .then(function(result){
                return result;
            })
            .catch(function(err){
                console.log("Promise rejection error: "+err);
            });
        }
    }

    // generate telegram message
    let msg = "";
    let headline = config.headline + expirationDateString + ")\n\n";
    msg += headline;
    spawnReport.forEach(element => {
        let nestString = "<a href='https://google.com/maps/@" + element.lat + "," + element.lon + ",14z'>" + element.name + "</a>: " + config.pokemon[element.nestPokemon-1] + "\n";
        msg += nestString;
    }); 
    postMsg(msg);
    
    // write in log and console
    logMsg = time + config.refreshString + expirationDateString + "\n__________________________";
    fs.writeFile(config.logFile, '------------------------\n' + logMsg + '\n', {flag: 'a'}, error => {if (error) {console.log(error)}});
    console.log(logMsg)
}

// db functions
getNest = function(nestName){
    return new Promise(function(resolve, reject){
        pool.query("SELECT name, nest_id, lat, lon, polygon_path FROM nests WHERE name = '" + nestName + "'", function(err, rows){                                                
            if(rows === undefined){
                reject(new Error("Error: rows is undefined"));
            }else{
                resolve(rows);
            }
        }
    )}
)}

getSpawnpoints = function(nestBounds){
    return new Promise(function(resolve, reject){
        pool2.query("SELECT id, lat, lon FROM spawnpoint WHERE lat > " + nestBounds[0] + " AND lon > " + nestBounds[1] + " AND lat < " + nestBounds[2] + " AND lon < " + nestBounds[3], function(err, rows){                                                
            if(rows === undefined){
                reject(new Error("Error: rows is undefined"));
            }else{
                resolve(rows);
            }
        }
    )}
)}

getSpawns = function(idList, date){
    return new Promise(function(resolve, reject){
        pool2.query("SELECT pokemon_id, COUNT(pokemon_id) as count FROM pokemon WHERE spawn_id IN (" + idList + ") AND first_seen_timestamp >= " + date + " GROUP BY pokemon_id ORDER BY count DESC LIMIT 1", function(err, rows){                                                
            if(rows === undefined){
                reject(new Error("Error: rows is undefined"));
            }else{
                rows = JSON.parse(JSON.stringify(rows));
                resolve(rows);
            }
        }
    )}
)}

updateMdb = function(nestName, id, updateTime, counter) {
    return new Promise(function(resolve, reject){
        pool.query("UPDATE nests SET pokemon_id = " + id + ", updated = " + updateTime + ", pokemon_count = " + counter + " WHERE name = '" + nestName + "'", function(err, result){                                                
            if(result === undefined){
                reject(new Error("Error: result is undefined"));
            }else{
                resolve(result);
            }
        }
    )}
)}

// helper
function lastNestChange() {
    let reference = 1599091200 * 1000;
    let actual = Date.now();
    let diff = actual - reference;
    do {
        diff -= 1209600000;
    } while (diff > 0);
    let result = (actual - (1209600000 - Math.abs(diff))) / 1000;
    return result;
}

function postMsg(msg) {
    axios.get('https://api.telegram.org/bot' + botToken + '/sendMessage?chat_id=' + chatId + '&parse_mode=html&disable_web_page_preview=true&text=' + encodeURIComponent(msg));
}

// listener for commands
let stdin = process.openStdin();
stdin.addListener("data", function(d) {
    let cmd = d.toString().trim();
    if (cmd == "post") {
        console.log("Manually posting. Creation of message started.")
        main();
    }
});

// initialize and start every two weeks
console.log("PoGo nestbot started\nTo manually trigger a post, type 'post' and enter.")
//let startTime = (lastNestChange() * 1000) + 57600000;
//const start = schedule.scheduleJob({start: startTime, rule: "0 8 * * */5"}, () => {
const start = schedule.scheduleJob("0 8 * * 5", () => {
    let oneWeekAfter = lastNestChange() * 1000 + 604800 * 1000;
    if (Date.now() < oneWeekAfter) {
        main();
        console.log("Creation of message started.")
    } else {
        console.log("It's too early, try again next week.")
    }
});