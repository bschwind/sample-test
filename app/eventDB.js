"use strict";
var mysql = require('mysql');
var config = require('../spec/config/config.json');
var jwt = require('jsonwebtoken');

var secretKey = "thisIsASecret"; // TODO - This should be an environment variable, not stored in source
var dateFormat = "%Y-%m-%d %T"; // Date format for dates returned from MySQL

var connectionPool = mysql.createPool({
	connectionLimit : 100,
	host : config.mysql.host,
	user : config.mysql.user,
	password : config.mysql.password,
	database : config.mysql.database,
	debug : false,
	dateStrings : true // We want dates returned as strings, not JS Date objects
});

module.exports.login = function(email, password, callback) {
	var result = {};

	connectionPool.getConnection(function(err, connection) {
		if (err) {
			console.log("Error retrieving connection from connection pool");
			result.error = "dbconnection";
			callback(result);
		}

		var queryString = "select * from users where email = ? AND password = sha1(?)";

		var query = connection.query(queryString, [email, password], function(err, rows) {
			connection.release();

			if (rows && rows.length > 0) {
				var first = rows[0];
				result.user = {
					id: first.id,
					name: first.name,
					group_id: first.group_id,
					token: jwt.sign({user_id: first.id, group_id: first.group_id}, secretKey)
				};

				callback(result);
			} else {
				result.error = "notfound";
				callback(result);
			}
		});
	});
};

function generateLimitOffsetString(limit, offset) {
	var limitString = "";
	var offsetString = "";

	if (offset) {
		offset = +offset;
		if (isNaN(offset) || offset <= 0) {
			return undefined;
		}

		offsetString = " OFFSET " + mysql.escape(offset);
	}

	if (limit) {
		limit = +limit;
		if (isNaN(limit) || limit <= 0) {
			return undefined;
		}

		limitString = " LIMIT " + mysql.escape(limit);
	} else {
		// http://stackoverflow.com/questions/255517/mysql-offset-infinite-rows
		limitString = " LIMIT 18446744073709551615";
	}

	return limitString + offsetString;
};

module.exports.listEvents = function(from, offset, limit, callback) {
	var result = {};

	var limitOffsetString = generateLimitOffsetString(limit, offset);

	if (!limitOffsetString) {
		result.error = "badlimitoffset";
		callback(result);
		return;
	}

	connectionPool.getConnection(function(err, connection) {
		if (err) {
			console.log("Error retrieving connection from connection pool");
			result.error = "dbconnection";
			callback(result);
		}

		var queryString = "select id, user_id, name, date_format(start_date, ?) as start_date \
			from events \
			where start_date >= ? \
			ORDER BY start_date" + generateLimitOffsetString(limit, offset);

		var query = connection.query(queryString, [dateFormat, from], function(err, rows) {
			connection.release();

			if (rows) {
				result.events = rows.map(function(x) {
					return {
						id: x.id,
						user_id: x.user_id,
						name: x.name,
						start_date: x.start_date
					};
				});

				callback(result);
			}
		});
	});
};

module.exports.reservationExists = function(user_id, event_id, callback) {
	var result = {};

	connectionPool.getConnection(function(err, connection) {
		if (err) {
			console.log("Error retrieving connection from connection pool");
			result.error = "dbconnection";
			callback(result);
		}

		var queryString = "SELECT 1 from attends where user_id = ? AND event_id = ?";

		connection.query(queryString, [user_id, event_id], function(err, rows) {
			if (rows && rows.length > 0) {
				callback(true);
			} else {
				callback(false);
			}
		});
	});
};

module.exports.cancelReservation = function(user_id, event_id, callback) {
	connectionPool.getConnection(function(err, connection) {
		if (err) {
			console.log("Error retrieving connection from connection pool");
			result.error = "dbconnection";
			callback(result);
		}

		var queryString = "DELETE from attends where user_id = ? AND event_id = ?";

		connection.query(queryString, [user_id, event_id], function(err, rows) {
			callback();
		});
	});
};

module.exports.createReservation = function(user_id, event_id, callback) {
	connectionPool.getConnection(function(err, connection) {
		if (err) {
			console.log("Error retrieving connection from connection pool");
			result.error = "dbconnection";
			callback(result);
		}

		var queryString = "INSERT INTO attends (user_id, event_id, reserved_at) VALUES (?, ?, ?)";

		connection.query(queryString, [user_id, event_id, new Date()], function(err, result) {
			callback();
		});
	});
};

module.exports.listCompanyEvents = function(user_id, from, limit, offset, callback) {
	var result = {};

	var limitOffsetString = generateLimitOffsetString(limit, offset);

	if (!limitOffsetString) {
		result.error = "badlimitoffset";
		callback(result);
		return;
	}

	connectionPool.getConnection(function(err, connection) {
		if (err) {
			console.log("Error retrieving connection from connection pool");
			result.error = "dbconnection";
			callback(result);
		}

		var queryString = "select e.id, e.user_id, e.name, date_format(e.start_date, ?) as start_date, (select count(user_id) from attends a where a.event_id = e.id) as num_people \
			from events e \
			WHERE e.start_date >= ? \
			AND e.user_id = ? \
			ORDER BY start_date" + generateLimitOffsetString(limit, offset);

		var query = connection.query(queryString, [dateFormat, from, user_id], function(err, rows) {
			connection.release();

			if (rows) {
				result.events = rows.map(function(x) {
					return {
						id: x.id,
						name: x.name,
						start_date: x.start_date,
						number_of_attendees: x.num_people
					};
				});

				callback(result);
			}
		});
	});
};

module.exports.extractTokenData = function(token) {
	var decoded = null;
	try {
		decoded = jwt.verify(token, secretKey);
	} catch (err) {
		return undefined;
	}

	if (!decoded) {
		return undefined;
	}

	return decoded;
};
