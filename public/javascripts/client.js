/**
 * Created by Varun on 2016/12/31.
 */

var socket = io();
var YouTubePlayer = require('youtube-player');
musicPlayer = YouTubePlayer('musicPlayer');

stateNames = {
    '-1': 'unstarted',
    0: 'ended',
    1: 'playing',
    2: 'paused',
    3: 'buffering',
    5: 'video cued'
};

musicPlayer.on('stateChange', function(event) {
    if(stateNames[event.data] == 'ended') {
        socket.emit('videoFinishedPlaying');
    }
});

// when new client connects, receive all current queue data from server
socket.on('initialQueueData', function(musicQueue){
    populateClientMusicQueue(musicQueue);
});

socket.on('getCurrentVideoElapsedTime', function(newClientSocketId) {
    musicPlayer.getCurrentTime().then(function(elapsedTime) {
        socket.emit('returnCurrentVideoElapsedTime', {
            "elapsedTime" : elapsedTime,
            "newClientSocketId" : newClientSocketId
        });
    });
});

socket.on('playCurrentVideoForNewClient', function(currentVideoData) {
    var currentMusicQueueObject = currentVideoData.currentMusicQueueObject;

    musicPlayer.loadVideoById(currentMusicQueueObject.id).then(function() {
        musicPlayer.seekTo(currentVideoData.elapsedTime).then(function() {
            updateNowPlayingHeader(currentMusicQueueObject.video, currentMusicQueueObject.kerberos);
        });
    });
});

socket.on('newSongQueueForClient', function(newMusicQueueObject) {
    addSongToBucketList(newMusicQueueObject.bucket, newMusicQueueObject.title, newMusicQueueObject.kerberos);
    // addNewSongQueueAlert(false, "Video successfully added to queue!", "");
    if(newMusicQueueObject.playVideo) {
        musicPlayer.loadVideoById(newMusicQueueObject.id).then(function() {
            updateNowPlayingHeader(newMusicQueueObject.title, newMusicQueueObject.kerberos);
        });
    }
});

socket.on('playNextSongInQueue', function(nextMusicQueueObject) {
    musicPlayer.stopVideo();
    if(nextMusicQueueObject.video == null && nextMusicQueueObject.kerberos == null) {
        emptyMusicQueue();
        return;
    }

    if(nextMusicQueueObject.musicQueue != null) {
        emptyMusicQueue();
        populateClientMusicQueue(nextMusicQueueObject.musicQueue);
    } else {
        $('#bucket0').find('li').first().remove();
    }

    musicPlayer.loadVideoById(nextMusicQueueObject.id).then(function() {
        updateNowPlayingHeader(nextMusicQueueObject.title, nextMusicQueueObject.kerberos);
    });
});

socket.on('videoAddError', function(AddVideoException) {
    addNewSongQueueAlert(true, "Failed to add video to queue!", "Please check that your youtube link is valid.");
});

socket.on('killEverything', function() {
    musicPlayer.stopVideo();
    emptyMusicQueue();
});

$('#nicknameField').find('button').click(function() {
    socket.emit('setNickname', $('#nicknameField').find('.form-control').val());
    $('#nicknameField').find('.form-control').val('')
});

$('#newSongQueue').find('button').click(function() {
    socket.emit('newSongQueue', $('#newSongQueue').find('.form-control').val());
    $('#newSongQueue').find('.form-control').val('')
});

addSongToBucketList = function(bucket, title, kerberos) {
    if($('#bucket' + bucket).length == 0) {
        $('#musicQueue').append('<div class="col-xs-12"><h3 class="text-center">Bucket ' + bucket + '</h3></div>');
        $('#musicQueue').append('<div class="col-xs-12"><ul class="list-group" id="bucket' + bucket + '"></ul></div>');
    }

    $('#bucket' + bucket).append('<li class="list-group-item">' + title + ' : ' + kerberos + '</li>')
};

updateNowPlayingHeader = function(title, kerberos) {
    musicPlayer.getVideoData().then(function(videoData) {
        $('#nowPlaying').empty();
        $('#nowPlaying').append('<h3>Now Playing : ' + videoData.title + ' <small>Queued by : ' + kerberos + '</small></h3>');
    });
};

emptyMusicQueue = function() {
    $('#musicQueue').find('div').empty();
};

addNewSongQueueAlert = function(isError, strongMessage, weakMessage) {
    $('#newSongQueueAlert').empty();
    var alertClass = "alert-success";
    if(isError) {
        alertClass = "alert-danger";
    }
    $('#newSongQueueAlert').append('<div class="alert ' +  alertClass + ' alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button><strong>' + strongMessage + '</strong> ' + weakMessage + '</div>');
    $(".alert-dismissible").delay(4000).slideUp(200, function() { $(this).alert('close'); });
};

populateClientMusicQueue = function(musicQueue) {
    for(var bucket = 0; bucket < musicQueue.length; bucket++) {
        for(var item = 0; item < musicQueue[bucket].length; item++) {
            addSongToBucketList(bucket, musicQueue[bucket][item].title, musicQueue[bucket][item].kerberos);
        }
    }
};