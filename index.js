var express = require('express');
var app = express();
app.use(express.static(__dirname + '/public'));
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request');
var getVideoId = require('get-video-id');

app.get('/', function(req, res){
    res.sendfile('index.html');
});

http.listen(3000, function(){
    console.log('listening on *:3000');
});

var musicQueue = [];
var masterSocket = {
    "kerberos" : null,
    "socketId" : null
};

io.on('connection', function(socket){
    console.log("Received connection from " + socket.id);
    socket.emit('initialQueueData', musicQueue);

    if(!isSocketMaster(socket.id) && musicQueue.length > 0 && masterSocket.socketId != null) {
        // todo: add method to start new client's video at the current playback time of the master
        io.to(masterSocket.socketId).emit('getCurrentVideoElapsedTime', socket.id);
    }

    socket.on('returnCurrentVideoElapsedTime', function(data) {
        if(musicQueue.length > 0) {
            io.to(data.newClientSocketId).emit('playCurrentVideoForNewClient', {
                "elapsedTime": data.elapsedTime,
                "currentMusicQueueObject": musicQueue[0][0]
            });
        }
    });

    socket.on('disconnect', function() {
        if(isSocketMaster(socket.id)) {
            console.log("Master socket has disconnected, all events will be stopped");
            musicQueue = [];
            masterSocket.socketId = null;
            io.sockets.emit('killEverything');
        }
    });

    socket.on('setNickname', function(nickname) {
        if(nickname == "amadeus") {
            console.log("New master socket confirmed. This too must be the choice of Steins;Gate");
            masterSocket.socketId = socket.id;
        }
    });

    socket.on('videoFinishedPlaying', function(){
        if(isSocketMaster(socket.id)) {
            console.log("Detected master finished playing, loading next video in queue");
            setTimeout(function() {
                var musicQueueData = null;

                if(musicQueue[0].length == 1) {
                    musicQueue.splice(0, 1);
                    musicQueueData = musicQueue;
                } else {
                    musicQueue[0].splice(0, 1);
                }

                var data = {};
                data["musicQueue"] = musicQueueData;
                data["video"] = null;
                data["kerberos"] = null;

                if(musicQueue.length != 0) {
                    Object.assign(data, musicQueue[0][0]);
                }

                console.log("Sending new video " + data.title + " to play");
                io.sockets.emit('playNextSongInQueue', data);
            }, 5000);
        }
    });

    socket.on('newSongQueue', function(newSong) {
        if(masterSocket.socketId == null) {
            console.log("No master socket set, request is ignored");
            return;
        }

        validateVideoLink(socket, newSong);
    });
});

validateVideoLink = function(socket, newSong) {
    request('https://www.youtube.com/oembed?url=' + newSong + '&format=json', function(error, response, body) {
        if (!error && response.statusCode == 200) {
            addNewSongToQueue(socket, newSong, {
                "title" : JSON.parse(body).title,
                "id" : getVideoId(newSong).id
            });
        } else {
            socket.emit('videoAddError', "Unable to add video to queue, please check that your youtube link is valid");
        }
    })
};

addNewSongToQueue = function(socket, newSong, videoMetadata) {
    console.log("New song added to queue " + newSong);
    var addedEntryInExistingBucket = 0;
    var bucketToAddSongIn = 0;
    var playVideo = 0;

    var data = {};
    data["video"] = newSong;
    //todo: THIS IS WHERE KERBEROS IS SET OVERALL
    data["kerberos"] = socket.id;
    Object.assign(data, videoMetadata);

    bucketLoop:
        for(var bucket = 0; bucket < musicQueue.length; bucket++) {
            for(var item = 0; item < musicQueue[bucket].length; item++) {
                if(musicQueue[bucket][item].kerberos == socket.id) {
                    continue bucketLoop;
                }
            }

            // managed to find an existing bucket which doesn't have entry for this kerberos, so just add entry in here
            musicQueue[bucket].push(data);
            addedEntryInExistingBucket = 1;
            bucketToAddSongIn = bucket;
            break;
        }

    // all the existing buckets already have entries for this kerberos, so create a new bucket now with the new entry
    if(!addedEntryInExistingBucket) {
        bucketToAddSongIn = musicQueue.length;
        musicQueue.push([data]);
    }

    if(musicQueue.length == 1 && musicQueue[0].length == 1) {
        playVideo = 1;
    }

    io.sockets.emit('newSongQueueForClient', Object.assign(data, {
        "bucket" : bucketToAddSongIn,
        "playVideo" : playVideo
    }));
};

isSocketMaster = function(socketId) {
    return socketId == masterSocket.socketId;
};
