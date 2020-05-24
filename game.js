const communication = require('./ws_communication.js')

//board
var cols = 8
var rows = 7
var board = []

var rock_chance = 0.2

//timing (in millis)
var turn_time = 3000
var beat_phase = 0

var turn_num = 0
var max_turn_num = 800

//game state
var game_state = 0
var STATE_WAITING = 0
var STATE_PLAYING = 1

var prev_winner = null

//players (a subset of clients)
var players = [];
var prev_players = [];
//var next_player_id = 0

var min_players_to_start = 2
var countdown_ticks_to_game_start = 20
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

//debug
var in_slow_mode = false
var slow_mode_can_resolve = false

//player sprites
//var num_sprite_packs = 8
var available_sprite_packs = []

var spawn_points = []

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

  //mark that all characters are available
  available_sprite_packs = []
  available_sprite_packs.push("BaldyBlue")
  available_sprite_packs.push("CrypticCyan")
  available_sprite_packs.push("GooeyGreen")
  available_sprite_packs.push("OrneryOrange")
  available_sprite_packs.push("PlacidPink")
  available_sprite_packs.push("RadRed")
  available_sprite_packs.push("ViciousViolet")
  available_sprite_packs.push("ViciousViolet")

  spawn_points = []
  spawn_points.push( {x:1, y:1})
  spawn_points.push( {x:1, y:4})
  spawn_points.push( {x:2, y:5})

  spawn_points.push( {x:5, y:1})
  spawn_points.push( {x:6, y:3})
  spawn_points.push( {x:6, y:5})

  spawn_points.push( {x:3, y:2})
  spawn_points.push( {x:4, y:4})
  

  turn_num = 0

  exports.make_map()

}

exports.make_tile = function(){
	return{
		passable: true,
    prev_passable: true,
    weak:false
	}
}

exports.start_game = function(){
  game_state = STATE_PLAYING
  beat_phase = 0
}

exports.end_game = function(winner){
  console.log("game over man. winner: "+winner)
  game_state = STATE_WAITING
  prev_winner = winner

  if (winner != null){
    winner.win_streak++
  }

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
  if (available_sprite_packs.length == 0){
    console.log("no more room!")
    _ws.send( JSON.stringify({type:"join_rejected", reason: "game is full"}))
    return
  }
  if (game_state == STATE_PLAYING){
    console.log("can't join in progress game!")
    _ws.send( JSON.stringify({type:"join_rejected", reason: "game is currently playing"}))
    return
  }

  //if this webhook already in?
  for (let i=0; i<players.length; i++){
    if (players[i].ws == _ws){
      console.log("this client is alreayd in. Ignoring join....")
      return
    }
  }

  console.log(msg)
  let player = null

  //was this player in last round?
  for (let i=0; i<prev_players.length; i++){
    if (prev_players[i].ws == _ws){
      console.log("an oldie but a goodie")
      player = prev_players[i]
      player.games_played++
      player.is_dead = false
      player.is_stunned = false
      player.sprite_pack = exports.get_next_sprite_pack()
      player.disp_name = msg.disp_name
    }
  }


  //otherwise make a new one
  if (player == null){
    console.log("time for a new baby")
    player = {
      ws:_ws,
      //id:next_player_id,
      uuid:msg.uuid,
      disp_name:msg.disp_name,
      sprite_pack: exports.get_next_sprite_pack(),
      x:0,
      y:0,
      prev_state:{},
      is_dead:false,
      is_stunned:false,
      input_type:INPUT_NONE,
      input_dir:DIR_NONE,
      last_valid_input_dir:DIR_UP,
      games_played : 0,
      win_streak: 0
    }
    //next_player_id++
  }

  //set starting pos
  let spawn_pos = exports.get_valid_spawn()
  player.x = spawn_pos.x
  player.y = spawn_pos.y
  player.prev_state.x = player.x
  player.prev_state.y = player.y
  player.prev_state.is_dead = player.is_dead

  console.log("got a new friend! "+player.disp_name)

  player.uuid = msg.uuid
  console.log("  my uuid: "+msg.uuid)
  
  players.push(player);

  //send confirmation
  player.ws.send( JSON.stringify({type:"join_confirm", info: exports.generate_game_info(), player_info:player}))
}

exports.get_valid_spawn = function(){
  if (spawn_points.length == 0){
    console.log("BAD! No more spawn points")
    return {x:0, y:0}
  }

  let index = Math.floor(Math.random()*spawn_points.length)
  let pos = spawn_points[index]
  spawn_points.splice(index, 1)
  return pos

  /*
  let pos = { x:0, y:0}

  let is_valid = false
  while(!is_valid){
    pos.x = Math.floor(1+Math.random()*(cols-2))
    pos.y = Math.floor(1+Math.random()*(rows-2))
    is_valid = true

    //is this impassable?
    if (board[pos.x][pos.y].passable == false){
      is_valid = false
    }
    //is somebody else here?
    for (let i=0; i<players.length; i++){
      if (pos.x == players[i].x && pos.y == players[i].y){
        is_valid = false
      }
    }
  }

  return pos
  */

}

exports.get_next_sprite_pack = function(){
  if (available_sprite_packs.length < 0){
    console.log("NO MORE SPRITE PACKS!!!!")
    return null
  }

  let index = Math.floor(Math.random()*available_sprite_packs.length)
  let val = available_sprite_packs[index]
  console.log("give them sprite pack "+index+" : "+val)

  available_sprite_packs.splice(index, 1)
  return val
  // for (let i=0; i<num_sprite_packs; i++){
  //   if (available_sprite_packs[i]){
  //     available_sprite_packs[i] = false
  //     return i
  //   }
  // }
  // console.log("ran out of sprite packs!!!!")
  // return 0
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
  if (player.input_dir != DIR_NONE){
    player.last_valid_input_dir = player.input_dir
  }

  console.log("action: "+player.input_type+" in dir "+player.input_dir)

}

exports.tick = function(){
	if (game_state === STATE_PLAYING){
	    if (beat_phase == 3){
        //if we're in the dbeug load, we might just wait
        if (in_slow_mode && !slow_mode_can_resolve){
          return;
        }
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
	    }else if (pregame_countdown_timer != countdown_ticks_to_game_start){
	      pregame_countdown_timer = countdown_ticks_to_game_start
	    }
      communication.send_wait_pulse()
	}
}

exports.resolve = function(){

  turn_num++
  console.log("turn "+turn_num+" out of "+max_turn_num)

  //is there a winner or a draw?
  let num_living = 0
  let num_dead = 0
  let last_living_player = null
  for (let i=0; i<players.length; i++){
    if (players[i].is_dead){
      num_dead ++
    }
    else{
      num_living ++
      last_living_player = players[i]
    }
  }
  console.log(" living: "+num_living+"  dead: "+num_dead)

  //if there is one living and no dead, I was probably testing
  if (num_living == 1 && num_dead > 0){
    console.log("we have a winner: "+last_living_player.disp_name)
    exports.end_game(last_living_player)
    return
  }
  if (num_living == 0){
    console.log("everybody is dead")
    exports.end_game(null)
    return
  }

  //initial board stuff
  for (let c=0; c<cols; c++){
    for (let r=0; r<rows; r++){
      board[c][r].prev_passable = board[c][r].passable
    }
  }

  //initial player stuff
  for (let i=0; i<players.length; i++){
    let player = players[i]

    //store their previous position
    player.prev_state.x = player.x
    player.prev_state.y = player.y
    player.prev_state.is_dead = player.is_dead

    //info on if their move succeeded or not. Assume it did
    let move_info = {}
    move_info.succeeded = true
    move_info.target_pos = {
      x:player.x,
      y:player.y
    }
    player.move_info = move_info

    //if they're dead, they do nothing
    if (player.is_dead){
      player.input_type = INPUT_NONE
      player.input_dir = DIR_NONE
    }

    //if they were stunned, just unstun them
    if (player.is_stunned){
      player.is_stunned = false
      player.input_type = INPUT_NONE
      player.input_dir = DIR_NONE
    }


  }

  //move until there are no conflicts
  exports.move_players()

  //stun anybody who dashed
  for (let i=0; i<players.length; i++){
    if (players[i].input_type == INPUT_DASH){
      players[i].is_stunned = true
    }
  }

  //see if anybody got slashed
  let slash_points = []
  for (let i=0; i<players.length; i++){
    let player = players[i]

    if (player.input_type == INPUT_DASH || player.input_type == INPUT_SLASH){
      let point = {
        x:player.x,
        y:player.y,
        attacker:player
      }
      if (player.input_dir == DIR_UP)     point.y--
      if (player.input_dir == DIR_RIGHT)  point.x++
      if (player.input_dir == DIR_DOWN)   point.y++
      if (player.input_dir == DIR_LEFT)   point.x--

      //for animation sake, store that point
      player.move_info.target_pos.x = point.x
      player.move_info.target_pos.y = point.y

      slash_points.push(point)
    }
  }

  //anybody standing on a slash point?
  for (let i=0; i<players.length; i++){
    let player = players[i]
    let attacked_this_turn = false
    for (let s=0; s<slash_points.length; s++){
      let slash_point = slash_points[s]
      if (slash_point.x == player.x && slash_point.y == player.y){
        console.log(player.disp_name + " is in the dead zone")
        attacked_this_turn = true
        if (player.input_type == INPUT_PARRY){
          console.log("but they parried")
          slash_point.attacker.is_stunned = true
          //set the parry player to face their attacker
          let attacker_x = slash_point.attacker.x
          let attacker_y = slash_point.attacker.y
          if (player.x == attacker_x-1) player.last_valid_input_dir = DIR_RIGHT
          if (player.x == attacker_x+1) player.last_valid_input_dir = DIR_LEFT
          if (player.y == attacker_y-1) player.last_valid_input_dir = DIR_DOWN
          if (player.y == attacker_y+1) player.last_valid_input_dir = DIR_UP

        }
        else{
          player.is_dead = true
          player.win_streak = 0 
        }
      }
    }

    //any weak obstacle on a slash point?
    for (let s=0; s<slash_points.length; s++){
      let slash_point = slash_points[s]
      let tile = board[slash_point.x][slash_point.y]
      if (!tile.passable && tile.weak){
        tile.passable = true
      }
    }

    //if they parried but were not attacked, they get stunned
    if (player.input_type == INPUT_PARRY && attacked_this_turn == false){
      player.is_stunned = true
    }
  }

 //  //are we done?
	// if (turn_num >= max_turn_num){
	//  exports.end_game()
	// }

}

exports.move_players = function(){
  console.log("---- START MOVE ----")
  let unresolved = []
  let occupied_spots = []

  for (let i=0; i<players.length; i++){
    let player = players[i]

    let skip = false
    //dead and stunned players will stay where they are no matter what
    if (player.is_dead || player.is_stunned){
      skip = true
    }
    //same for slashing or stationary players
    if (player.input_type == INPUT_SLASH || player.input_type == INPUT_PARRY || player.input_type == INPUT_NONE){
      skip = true
    }

    if (skip){
      if (!player.is_dead){
        occupied_spots.push( {x:player.x, y:player.y} )
      }
    }else{
      unresolved.push(player)
    }
  }

  console.log("num unresolved: "+unresolved.length)

  //for unresolved players, I need a little more info to track 'em
  for (let i=unresolved.length-1; i>=0; i--){
    let player = unresolved[i]
    if (player.input_type != INPUT_MOVE && player.input_type != INPUT_DASH){
      console.log("BAD BAD THIS PLAYER SHOULD NOT MOVE WITH INPUT: "+player.input_type)
    }

    //where do they want to go?
    if (player.input_dir == DIR_UP)     player.move_info.target_pos.y--
    if (player.input_dir == DIR_RIGHT)  player.move_info.target_pos.x++
    if (player.input_dir == DIR_DOWN)   player.move_info.target_pos.y++
    if (player.input_dir == DIR_LEFT)   player.move_info.target_pos.x--

    //if anybody walked into a wall we can resolve them right now
    if (exports.is_move_valid(player.move_info.target_pos) == false){
      player.move_info.succeeded = false
      console.log(player.disp_name+" walked into a wall")
      occupied_spots.push( {x:player.x, y:player.y} )
      unresolved.splice(i, 1)
    }
  }

  console.log("num unresolved before loop: "+unresolved.length)

  
  //after that we need to go through in waves attempting to resolve the safest move
  let num_tries = 0
  while (unresolved.length > 0 && num_tries < 99){
    num_tries++
    console.log("--move pass "+num_tries+"--")
    let fails_on_this_pass = 0

    for (let i=unresolved.length-1; i>=0; i--){
      let mover = unresolved[i]
      console.log(" checking "+mover.disp_name)

      let is_safe_to_move = true
      //let cannot_move = false

      //if two players would swap spots, the move is illegal
      for (let u=unresolved.length-1; u>=0; u--){
        let other = unresolved[u]
        if (other != mover){
          if (mover.move_info.target_pos.x == other.x &&
              mover.move_info.target_pos.y == other.y &&
              other.move_info.target_pos.x == mover.x &&
              other.move_info.target_pos.y == mover.y){

            mover.move_info.succeeded = false
            other.move_info.succeeded = false
            is_safe_to_move = false

            console.log("no swapping places")
          }

          //also illegal to have the same target
          if (mover.move_info.target_pos.x == other.move_info.target_pos.x &&
              mover.move_info.target_pos.y == other.move_info.target_pos.y){

            mover.move_info.succeeded = false
            other.move_info.succeeded = false
            is_safe_to_move = false

            console.log(mover.disp_name+" and "+other.disp_name+" want to go to the same spot")
          }
        }
      }

      //is the target is occupied, the move fails
      console.log(" against "+occupied_spots.length+" occupied spots")
      for (let o=0; o<occupied_spots.length; o++){
        if (mover.move_info.target_pos.x == occupied_spots[o].x && mover.move_info.target_pos.y == occupied_spots[o].y){
          console.log(mover.disp_name+" trying to move to occupied spot")
          mover.move_info.succeeded = false
          is_safe_to_move = false
        }
      }



      // if (cannot_move){
      //   console.log(mover.disp_name+" cannot move")
      //   occupied_spots.push( {x:mover.x, y:mover.y} )
      //   unresolved.splice(i, 1)
      // }
      // else{
      if (is_safe_to_move){
        //any other unresolved in or looking to move ot the same spot?
        for (let u=unresolved.length-1; u>=0; u--){
          let other = unresolved[u]
          if (other != mover){
            if ( (mover.move_info.target_pos.x == other.x && mover.move_info.target_pos.y == other.y) || (mover.move_info.target_pos.x == other.move_info.target_pos.x && mover.move_info.target_pos.y == other.move_info.target_pos.y)){
              is_safe_to_move = false
            }
          }
        }

        if (is_safe_to_move){
          console.log(mover.disp_name+" is safe to move")
          mover.x = mover.move_info.target_pos.x
          mover.y = mover.move_info.target_pos.y
          mover.move_info.succeeded = true
          occupied_spots.push( {x:mover.x, y:mover.y} )
          unresolved.splice(i, 1)
        }

      }
    }

    //go through and see if we can remove any failuers
    for (let i=unresolved.length-1; i>=0; i--){
      let mover = unresolved[i]
      if (mover.move_info.succeeded == false){
        console.log(mover.disp_name +" cannot move")
        occupied_spots.push( {x:mover.x, y:mover.y} )
        unresolved.splice(i, 1)
        fails_on_this_pass++
      }
    }

    console.log(fails_on_this_pass+" moves were invalidated")

    //if nothing fails aprove whatever is left
    if (fails_on_this_pass == 0){
      console.log("we are done")
      for (let i=unresolved.length-1; i>=0; i--){
        let mover = unresolved[i]
        console.log("  aproving "+mover.disp_name)
        mover.x = mover.move_info.target_pos.x
        mover.y = mover.move_info.target_pos.y
      }
      unresolved = []
    }

  }

  console.log("done with moves")
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

  slow_mode_can_resolve = false
}


exports.generate_game_info = function(){
  let time = Date.now()
  let val = {
    board:board,
    players:players,
    turn_num: turn_num,
    max_turn_num: max_turn_num,
    time:time,
    game_state:game_state,
    winner_last_round:prev_winner
  }

  //console.log("game state "+val.game_state)

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
      //during the game, only remove the player if they are alive
      //if (game_state == STATE_WAITING || !players[i].is_dead){  //THIS WAS A BAD IDEA
			 players.splice(i, 1)
      //}
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


exports.make_map = function(){
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
    board[c][0].weak = false
    board[c][rows-1].passable = false
    board[c][rows-1].weak = false
  }
  for (let r=0; r<rows; r++){
    board[0][r].passable = false
    board[0][r].weak = false
    board[cols-1][r].passable = false
    board[cols-1][r].weak = false
  }

  //set a bunch of tiles to be impassable
  let num_obstacles = 7 + Math.random() * 15
  console.log("I want "+num_obstacles+" obstacles")
  for (let i=0; i<30; i++){
    let x = Math.floor(1+Math.random()*(cols-2))
    let y = Math.floor(1+Math.random()*(rows-2))
    board[x][y].passable = false

    //make sure all tiles connect to spawn 6
    let all_connect = true
    for (let i=0; i<spawn_points.length; i++){
      let connects = exports.do_tiles_connect(spawn_points[i], spawn_points[6])
      if (!connects){
        all_connect = false
      }
    }

    //if they don't, put that tile back the way it was
    if (all_connect == false){
      board[x][y].passable = true
    }else{
      //small chance to make it a strong obstacle
      if (Math.random() < rock_chance){
        board[x][y].weak = false
      }else{
        board[x][y].weak = true
      }
    }
  }

  //make sure all spawn points are passable
  for (let i=0; i<spawn_points.length; i++){
    board[spawn_points[i].x][spawn_points[i].y].passable = true
  }

  //get everything ready
  for (let c=0; c<cols; c++){
    for (let r=0; r<rows; r++){
      board[c][r].prev_passable = board[c][r].passable
    }
  }

  
}

exports.do_tiles_connect = function (tile_a, tile_b){

  let unexplored = []
  let explored = []

  unexplored.push(tile_a)

  while (unexplored.length > 0){
    let cur_tile = unexplored.pop()
    explored.push(cur_tile)

    if (cur_tile.x == tile_b.x && cur_tile.y == tile_b.y){
      return true
    }

    let neighbors = []
    if (cur_tile.x > 0) neighbors.push({x:cur_tile.x-1, y:cur_tile.y})
    if (cur_tile.y > 0) neighbors.push({x:cur_tile.x, y:cur_tile.y-1})
    if (cur_tile.x < cols-1) neighbors.push({x:cur_tile.x+1, y:cur_tile.y})
    if (cur_tile.y < rows-1) neighbors.push({x:cur_tile.x, y:cur_tile.y+1})

    for (let i=0; i<neighbors.length; i++){
      if (!exports.list_contians_tile(unexplored, neighbors[i]) && !exports.list_contians_tile(explored, neighbors[i])){
        if (board[neighbors[i].x][neighbors[i].y].passable){
          unexplored.push(neighbors[i])
        }
      }
    }
  }

  return false

}

exports.list_contians_tile = function (list, tile){
  for (let i=0; i<list.length; i++){
    if (list[i].x == tile.x && list[i].y == tile.y){
      return true
    }
  }
  return false
}

//debug
exports.start_slow_test = function(){
  in_slow_mode = true
}
exports.get_debug_resolve = function(){
  slow_mode_can_resolve = true
}




