"use strict";
var express = require('express');
var bodyParser = require('body-parser');
var eventDB = require('./eventDB');

var app = express();

// Set up middleware
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/api/auth/login", function(req, res) {
	var data = {};

	var email = req.body.email;
	var password = req.body.password;

	eventDB.login(email, password).then(function(user) {
		data = {
			code: 200,
			token: user.token,
			user: {
				id: user.id,
				name: user.name,
				group_id: user.group_id
			}
		};

		res.json(data);
	})
	.catch(function(e) {
		// Unsuccessful login
		data.code = 500;
		res.json(data);
	});
});

app.get("/api/users/events", function(req, res) {
	var data = {};

	var from = req.query.from;
	var offset = req.query.offset;
	var limit = req.query.limit;

	if (!from || limit === "0") {
		res.sendStatus(400);
		return;
	}

	eventDB.listEvents(from, offset, limit).then(function(events) {
		data.events = events;
		data.code = 200;

		res.json(data);
	})
	.catch(function(e) {
		console.log(e);
		res.sendStatus(400);
	});
});

app.post("/api/users/reserve", function(req, res) {
	var data = {};

	var token = req.body.token;
	var event_id = req.body.event_id;
	var reserve = req.body.reserve;

	if (!token || !event_id || !reserve) {
		data.code = 401;
		data.message = "'token', 'event_id', and 'reserve' are required";
		res.json(data);
		return;
	}

	var decoded = eventDB.extractTokenData(token);

	if (!decoded) {
		data.code = 401;
		data.message = "Invalid token";
		res.json(data);
		return;
	}

	// If this user is not a student
	if (decoded.group_id != 1) {
		data.code = 401;
		data.message = "Only students can make reservations";
		res.json(data);
		return;
	}

	eventDB.reservationExists(decoded.user_id, event_id).then(function(exists) {
		if (reserve === "true") {
			if (exists) {
				// Reservation already exists
				data.code = 501;
				data.message = "Already reserved";
				res.json(data);
			} else {
				// Make a new reservation
				return eventDB.createReservation(decoded.user_id, event_id).then(function() {
					data.code = 200;
					res.json(data);
				});
			}
		} else {
			if (exists) {
				// Cancel the reservation
				return eventDB.cancelReservation(decoded.user_id, event_id).then(function() {
					data.code = 200;
					res.json(data);
				});
			} else {
				// Can't cancel a non-existent reservation
				data.code = 502;
				data.message = "Not reserved";
				res.json(data);
			}
		}
	})
	.catch(function(e) {
		console.log(e);
	});
});

app.post("/api/companies/events", function(req, res) {
	var data = {};

	var token = req.body.token;
	var from = req.body.from;
	var offset = req.body.offset;
	var limit = req.body.limit;

	if (!token || !from || limit === "0") {
		res.sendStatus(400);
		return;
	}

	var decoded = eventDB.extractTokenData(token);

	if (!decoded) {
		data.code = 401;
		data.message = "Invalid token";
		res.json(data);
		return;
	}

	// If this user is not a company
	if (decoded.group_id != 2) {
		data.code = 401;
		data.message = "Only companies can list their events";
		res.json(data);
		return;
	}

	eventDB.listCompanyEvents(decoded.user_id, from, limit, offset).then(function(events) {
		data.events = events;
		data.code = 200;

		res.json(data);
	})
	.catch(function(e) {
		console.log(e);
	});
});

// Start the server on port 8888
var server = app.listen(8888, function() {
	console.log('Listening on port %d', server.address().port);
});
