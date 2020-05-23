const communication = require('./ws_communication.js')

//board
var cols = 9
var rows = 8
var board = []

//timing (in millis)
var turn_time = 3000
var beat_phase = 0

var turn_num = 0
var max_turn_num = 8

//game state
var game_state = 0
var STATE_WAITING = 0
var STATE_PLAYING = 1

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

var INPUT_NONE = 0
var INPUT_MOVE = 1
var INPUT_SLASH = 2
var INPUT_DASH = 3
var INPUT_PARRY = 4

exports.setup = function(){
	game_state = STATE_WAITING
 	exports.reset_game()
 	console.log("here how long: "+turn_time)
}

exports.get_turn_time = function(){
	return turn_time
}

exports.get_base_info = function(){
	return {
		turn_time:turn_time,
    	cols: cols,
    	rows: rows
	}
}


exports.reset_game = function(){
  players = []

  turn_num = 0

  //create a 2d array
  board = new Array(cols)
  for (let i=0; i<cols; i++){
    board[i] = new Array(rows)
  }
  //fill it up with new Tile objects
  for (let c=0; c<cols; c++){
    for (let r=0; r<rows; r++){
      board[c][r] = exports.make_tile()
    }
  }

  //make the borders into walls
  for (let c=0; c<cols; c++){
  	board[c][0].passable = false
  	board[c][rows-1].passable = false
  }
  for (let r=0; r<rows; r++){
  	board[0][r].passable = false
  	board[cols-1][r].passable = false
  }

  //testing
  board[3][3].passable = false
}

exports.make_tile = function(){
	return{
		passable: true
	}
}

exports.start_game = function(){
  game_state = STATE_PLAYING
  beat_phase = 0
}

exports.end_game = function(){
  console.log("game over man")
  game_state = STATE_WAITING

  pregame_countdown_timer = countdown_ticks_to_game_start
  
  prev_players = []
  for (let i=0; i<players.length; i++){
    prev_players.push(players[i])
  }

  exports.reset_game()
  communication.send_game_end()
}

//creating a player object
exports.join_player = function (msg, _ws){

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
      prev_x:0,
      prev_y:0,
      is_dead:false,
      is_stunned:false,
      input_type:INPUT_NONE,
      input_dir:DIR_NONE,
      games_played : 0,
      win_streak: 0
    }
    next_player_id++
  }

  //set starting pos
  player.x = Math.floor(1+Math.random()*(cols-2))
  player.y = Math.floor(1+Math.random()*(rows-2))
  player.prev_x = player.x
  player.prev_y = player.y

  console.log("got a new friend! id:"+player.id)
  
  players.push(player);

  //send confirmation
  player.ws.send( JSON.stringify({type:"join_confirm", player_info:player}))
}

exports.parse_client_move = function(msg, ws){
  //figure out who moved
  let player = exports.get_player_from_ws(ws)
  if (player == null){
    console.log("they fake")
    return
  }

  //store some basic stuff
  player.moved_this_turn = true

  //check what it was
  player.input_type = msg.action
  player.input_dir = msg.dir

  console.log("action: "+player.input_type+" in dir "+player.input_dir)

}

exports.tick = function(){
	if (game_state === STATE_PLAYING){
	    if (beat_phase == 3){
	      exports.resolve()
	      //if the game is still going, send the board
	      if (game_state == STATE_PLAYING){
	        communication.send_board()
	      }else{
	        console.log("lol we are done")
	      }
	      exports.resolve_cleanup()
	      beat_phase = -1
	    }
	    else{
	      //console.log("pulse")
	      communication.send_pulse()
	    }
	    beat_phase++
	}

  	if (game_state === STATE_WAITING){
	    if (pregame_countdown_timer == 0){
	      exports.start_game()
	      return
	    }

	    if (players.length >= min_players_to_start){
	      pregame_countdown_timer--
	      communication.send_wait_pulse()
	    }else if (pregame_countdown_timer != countdown_ticks_to_game_start){
	      pregame_countdown_timer = countdown_ticks_to_game_start
	      communication.send_wait_pulse()
	    }
	}
}

exports.resolve = function(){

	turn_num++
	console.log("turn "+turn_num+" out of "+max_turn_num)

	//update players
	for (let i=0; i<players.length; i++){
	    let player = players[i]

	    //store their previous position
	    player.prev_x = player.x
	    player.prev_y = player.y

	    //if they were stuned, just unstun them
	    if (player.is_stunned){
	    	player.is_stunned = false
	    	player.input_type = INPUT_NONE
	    	player.input_dir = DIR_NONE
	    }
	    else{

	    	console.log("move type: "+player.input_type)

		    //did they move?
		    if (player.input_type == INPUT_MOVE || player.input_type == INPUT_DASH){

		    	let target_pos = {
		    		x:player.x,
		    		y:player.y
		    	}

			    if (player.input_dir == DIR_UP) target_pos.y--
			    if (player.input_dir == DIR_RIGHT) target_pos.x++
			    if (player.input_dir == DIR_DOWN) target_pos.y++
			    if (player.input_dir == DIR_LEFT) target_pos.x--

			    if (exports.is_move_valid(target_pos)){
			    	player.x = target_pos.x
			    	player.y = target_pos.y
			    }

			}

			//should they be stunned?
			if (player.input_type == INPUT_DASH){
				player.is_stunned = true
			}
		}

	}

    // //clamp to bounds
    // if (player.x >= cols)   players[i].x = cols-1
    // if (player.x < 0)       players[i].x = 0
    // if (player.y >= rows)   players[i].y = rows-1
    // if (player.y < 0)       players[i].y = 0
  

  // //tick down the board
  // for (let c=0; c<cols; c++){
  //   for (let r=0; r<rows; r++){
  //     board[c][r].prev_val =board[c][r].val
  //     if (board[c][r].val > 0){
  //       board[c][r].val --
  //     }
  //   }
  // }

  // //refresh the board where players are
  // for (let i=0; i<players.length; i++){
  //   board[players[i].prev_x][players[i].prev_y].val = 4
  // }

	//are we done?
	if (turn_num >= max_turn_num){
	exports.end_game()
	}

}

//checks if a move location is free
exports.is_move_valid = function(target_pos){
	if (target_pos.x < 0 || target_pos.x >= cols || target_pos.y < 0 || target_pos.y >= rows){
		return false
	}

	if (board[target_pos.x][target_pos.y].passable == false){
		return false
	}



	return true
}

exports.resolve_cleanup = function(){

	//reset players
	for (let i=0; i<players.length; i++){
    	let player = players[i]
    	player.input_type = INPUT_NONE
    	player.input_dir = DIR_NONE
	}
}


exports.generate_game_info = function(){
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

exports.get_wait_message = function(){
  if (players.length < min_players_to_start){
    return "Need at least "+ (min_players_to_start-players.length).toString() +" more players to start"
  }
  else{
    return "Starting in "+pregame_countdown_timer.toString()
  }
}


exports.get_player_from_ws = function(ws){
  for (let i=0; i<players.length; i++){
    if (players[i].ws == ws){
      return players[i]
    }
  }
  return null
}

exports.remove_player = function(ws){
	for (let i=0; i<players.length; i++){
		if (players[i].ws == ws){
			console.log("found and killed player")
			players.splice(i, 1)
			if ( game_state == STATE_WAITING){
			  communication.send_wait_pulse()
			}
		}
	}
}

exports.get_game_state = function(){
	if (game_state == STATE_PLAYING){
		return "playing"
	}
	if (game_state == STATE_WAITING){
		return "waiting"
	}

	return "unkown"
}

exports.get_beat_phase = function(){
	return beat_phase
}