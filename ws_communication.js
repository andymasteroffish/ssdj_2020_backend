const game = require('./game.js')

var clients = []

exports.got_connection = function (ws){
	console.log('Client connected');

	clients.push(ws)

	let base_info = game.get_base_info()

	//send that they connected confirmation
	ws.send( JSON.stringify({
		type:"connect_confirm",
		turn_time:base_info.turn_time,
		cols: base_info.cols,
		rows: base_info.rows,
		info: game.generate_game_info(),
		wait_message: game.get_wait_message()
	}))

	//start listening
	ws.on('message', function incoming(msg_raw){
		//console.log("I got "+msg_raw)
		let msg = JSON.parse(msg_raw)

		if (msg.type === 'join_request'){
			game.join_player(msg, ws)
			exports.send_wait_pulse()
		}

		if (msg.type === 'client_move'){
			game.parse_client_move(msg, ws)
		}

		if (msg.type === "force_start"){
			console.log("you have forced me to start")
			game.start_game()
		}

		if (msg.type === "force_end"){
			console.log("you have forced me to end")
			game.end_game()
		}

	})

	ws.on('close', () => {
		console.log('Client disconnected')
		//kill em
		game.remove_player(ws)
		for (let i=0; i<clients.length; i++){
		  if (clients[i] == ws){
		    console.log("found and killed client")
		    clients.splice(i, 1)
		  }
		}
	});
}

exports.send_wait_pulse = function(){
  let val = {
    type:"wait_pulse",
    info: game.generate_game_info(),
    wait_message: game.get_wait_message()
  }
  exports.send_json_to_clients(JSON.stringify(val))
}

exports.send_game_end = function(){

  let val = {
    type:"game_end",
    info: game.generate_game_info(),
    wait_message: game.get_wait_message()
  }
  exports.send_json_to_clients(JSON.stringify(val))
}

exports.send_board = function(){
  let time = Date.now()
  //console.log(time)
  let val = {
    type:"board",
    info: game.generate_game_info()
  }
  let json = JSON.stringify(val)
  exports.send_json_to_clients(json)
}

exports.send_pulse = function(){
  let time = Date.now()
  //console.log(time)
  let val = {
    type:"pulse",
    phase: game.get_beat_phase(),
    time: time,
    wait_message: ""
  }
  let json = JSON.stringify(val)
  exports.send_json_to_clients(json)
}

exports.send_json_to_clients = function(json){
  for (let i=0; i<clients.length; i++){
    clients[i].send(json)
  }
}




