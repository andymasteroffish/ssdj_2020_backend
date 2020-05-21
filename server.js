//https://devcenter.heroku.com/articles/node-websockets

'use strict';

const express = require('express');
const { Server } = require('ws');

//heroku will force this to be port 80
const PORT = process.env.PORT || 3000;

const INDEX = '/index.html';

//board
var cols = 6
var rows = 5
var board = []

//timing
var turn_time = 3000
var beat_phase = 0

var turn_num = 0
var max_turn_num = 8

//game state
var STATE_WAITING = 0
var STATE_PLAYING = 1
var game_state = 0

//clients
var clients = []

//players (a subset of clients)
var players = [];
var prev_players = [];
var next_player_id = 0

var min_players_to_start = 2
var countdown_ticks_to_game_start = 5
var pregame_countdown_timer = countdown_ticks_to_game_start

//some direction stuff
var DIR_NONE = -1
var DIR_UP = 0
var DIR_RIGHT = 1
var DIR_DOWN = 2
var DIR_LEFT = 3


//setting up a sevrer
const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const wss = new Server({ server });

function setup(){
  game_state = STATE_WAITING
  reset_game()
}

function tick(){
  if (game_state === STATE_PLAYING){
    if (beat_phase == 3){
      resolve()
      //if the game is still going, send the board
      if (game_state == STATE_PLAYING){
        send_board()
      }else{
        console.log("lol we are done")
      }
      beat_phase = -1
    }
    else{
      //console.log("pulse")
      send_pulse()
    }
    beat_phase++
  }

  if (game_state === STATE_WAITING){
    if (pregame_countdown_timer == 0){
      start_game()
      return
    }

    if (players.length >= min_players_to_start){
      pregame_countdown_timer--
      send_wait_pulse()
    }else if (pregame_countdown_timer != countdown_ticks_to_game_start){
      pregame_countdown_timer = countdown_ticks_to_game_start
      send_wait_pulse()
    }
  }
}

//getting a new connection
wss.on('connection', (ws) => {
  console.log('Client connected');

  clients.push(ws)

  //send that they connected confirmation
  ws.send( JSON.stringify({
    type:"connect_confirm",
    turn_time:turn_time,
    cols: cols,
    rows: rows,
    info: generate_game_info(),
    wait_message: get_wait_message()
  }))

  //start listening
  ws.on('message', function incoming(msg_raw){
    //console.log("I got "+msg_raw)
    let msg = JSON.parse(msg_raw)

    if (msg.type === 'join_request'){
      join_player(msg, ws)
      send_wait_pulse()
    }
    
    if (msg.type === 'client_move'){
      parse_client_move(msg, ws)
    }

    if (msg.type === "force_start"){
      console.log("you have forced me to start")
      start_game()
    }

    if (msg.type === "force_end"){
      console.log("you have forced me to end")
      end_game()
    }

  })

  ws.on('close', () => {
    console.log('Client disconnected')
    //kill em
    for (let i=0; i<players.length; i++){
      if (players[i].ws == ws){
        console.log("found and killed player")
        players.splice(i, 1)
        if (game_state == STATE_WAITING){
          send_wait_pulse()
        }
      }
    }
    for (let i=0; i<clients.length; i++){
      if (clients[i] == ws){
        console.log("found and killed client")
        clients.splice(i, 1)
      }
    }
  });
});

//creating a player objects
function join_player (msg, _ws){

  let player = null

  //was this player in last round?
  for (let i=0; i<prev_players.length; i++){
    if (prev_players[i].ws == _ws){
      console.log("an oldie but a goodie")
      player = prev_players[i]
      player.games_played++
    }
  }

  //otherwise make a new one
  if (player == null){
    console.log("time for a new baby")
    player = {
      ws:_ws,
      id:next_player_id,
      disp_name:msg.disp_name,
      x:0,
      y:0,
      moved_this_turn:false,
      input_dir:DIR_NONE,
      games_played : 0
    }
    next_player_id++
  }

  //set starting pos
  player.x = Math.floor(Math.random()*cols)
  player.y = Math.floor(Math.random()*rows)
  player.prev_x = player.x
  player.prev_y = player.y

  console.log("got a new friend! id:"+player.id)
  
  players.push(player);

  //send confirmation
  player.ws.send( JSON.stringify({type:"join_confirm", player_info:player}))
}

function parse_client_move(msg, ws){
  //figure out who moved
  let player = get_player_from_ws(ws)
  if (player == null){
    console.log("they fake")
    return
  }

  player.moved_this_turn = true
  player.prev_x = player.x
  player.prev_y = player.y

  //left
  if (msg.key == 37)  player.input_dir = DIR_LEFT
  //up
  if (msg.key == 38)  player.input_dir = DIR_UP
  //right
  if (msg.key == 39)  player.input_dir = DIR_RIGHT
  //down
  if (msg.key == 40)  player.input_dir = DIR_DOWN

}

function send_wait_pulse(){
  let val = {
    type:"wait_pulse",
    info: generate_game_info(),
    wait_message: get_wait_message()
  }
  send_json_to_clients(JSON.stringify(val))
}

function send_game_end(){

  let val = {
    type:"game_end",
    info: generate_game_info(),
    wait_message: get_wait_message()
  }
  send_json_to_clients(JSON.stringify(val))
}

function generate_game_info(){
  let time = Date.now()
  let val = {
    board:board,
    players:players,
    turn_num: turn_num,
    max_turn_num: max_turn_num,
    time:time
  }

  return val
}

// function send_game_start(){
//   let val = {
//     type:"game_start",
//     info: generate_game_info()
//   }
//   send_json_to_clients(JSON.stringify(val))
// }

function send_board(){
  let time = Date.now()
  //console.log(time)
  let val = {
    type:"board",
    info: generate_game_info()
  }
  let json = JSON.stringify(val)
  send_json_to_clients(json)
}

function send_pulse(){
  let time = Date.now()
  //console.log(time)
  let val = {
    type:"pulse",
    phase:beat_phase,
    time: time,
    wait_message: ""
  }
  let json = JSON.stringify(val)
  send_json_to_clients(json)
}

function send_json_to_clients(json){
  for (let i=0; i<clients.length; i++){
    clients[i].send(json)
  }
}

function get_player_from_ws(ws){
  for (let i=0; i<players.length; i++){
    if (players[i].ws == ws){
      return players[i]
    }
  }
  return null
}

function get_wait_message(){
  if (players.length < min_players_to_start){
    return "Need at least "+ (min_players_to_start-players.length).toString() +" more players to start"
  }
  else{
    return "Starting in "+pregame_countdown_timer.toString()
  }
}

setInterval(() => {
  tick()
}, turn_time/4);

setup()


//***************
//Gameplay
//***************

//reset
function reset_game(){
  players = []

  turn_num = 0

  board = new Array(cols)
  for (let i=0; i<cols; i++){
    board[i] = new Array(rows)
  }

  for (let c=0; c<cols; c++){
    for (let r=0; r<rows; r++){
      board[c][r] = {
        val : 0,
        prev_val : 0
      }
    }
  }
}

function start_game(){
  game_state = STATE_PLAYING
  beat_phase = 0
}

function end_game(){
  console.log("game over man")
  game_state = STATE_WAITING

  pregame_countdown_timer = countdown_ticks_to_game_start
  
  prev_players = []
  for (let i=0; i<players.length; i++){
    prev_players.push(players[i])
  }

  reset_game()
  send_game_end()
}

function resolve(){

  turn_num++
  console.log("turn "+turn_num+" out of "+max_turn_num)

  //update players
  for (let i=0; i<players.length; i++){
    let player = players[i]

    //store their previous position
    player.prev_x = player.x
    player.prev_y = player.y

    //did they move?
    if (player.input_dir == DIR_UP) player.y--
    if (player.input_dir == DIR_RIGHT) player.x++
    if (player.input_dir == DIR_DOWN) player.y++
    if (player.input_dir == DIR_LEFT) player.x--

    //prep them for next turn
    player.input_dir = DIR_NONE

    //clamp to bounds
    if (player.x >= cols)   players[i].x = cols-1
    if (player.x < 0)       players[i].x = 0
    if (player.y >= rows)   players[i].y = rows-1
    if (player.y < 0)       players[i].y = 0
  }

  //tick down the board
  for (let c=0; c<cols; c++){
    for (let r=0; r<rows; r++){
      board[c][r].prev_val =board[c][r].val
      if (board[c][r].val > 0){
        board[c][r].val --
      }
    }
  }

  //refresh the board where players are
  for (let i=0; i<players.length; i++){
    board[players[i].prev_x][players[i].prev_y].val = 4
  }

  //are we done?
  if (turn_num >= max_turn_num){
    end_game()
  }

}