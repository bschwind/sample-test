"use strict";
var Promise = require("bluebird");
var mysql = require('mysql');
var config = require('../spec/config/config.json');
var jwt = require('jsonwebtoken');

// "Promisify" the mysql functions so we can use them as promises
Promise.promisifyAll(require("mysql/lib/Connection").prototype);
Promise.promisifyAll(require("mysql/lib/Pool").prototype);

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

// Returns a promise with the results of the query
function executeQuery(query, parameters) {
	return connectionPool.getConnectionAsync().then(function(connection) {
		return connection.queryAsync(query, parameters).spread(function(rows) {
			return rows;
		})
		.finally(function() {
			connection.release();
		});
	});
}

function generateLimitOffsetString(limit, offset) {
	var limitString = "";
	var offsetString = "";

	if (offset) {
		offset = +offset;
		if (isNaN(offset) || offset <= 0) {
			return "";
		}

		offsetString = " OFFSET " + mysql.escape(offset);
	}

	if (limit) {
		limit = +limit;
		if (isNaN(limit) || limit <= 0) {
			return "";
		}

		limitString = " LIMIT " + mysql.escape(limit);
	} else {
		// http://stackoverflow.com/questions/255517/mysql-offset-infinite-rows
		limitString = " LIMIT 18446744073709551615";
	}

	return limitString + offsetString;
}

module.exports.login = function(email, password) {
	var queryString = "select * from users where email = ? AND password = sha1(?)";

	return executeQuery(queryString, [email, password]).then(function(rows) {
		var first = rows[0];
		var user = {
			id: first.id,
			name: first.name,
			group_id: first.group_id,
			token: jwt.sign({user_id: first.id, group_id: first.group_id}, secretKey)
		};

		return user;
	});
};

module.exports.listEvents = function(from, offset, limit) {
	var limitOffsetString = generateLimitOffsetString(limit, offset);

	var queryString = "select id, user_id, name, date_format(start_date, ?) as start_date \
			from events \
			where start_date >= ? \
			ORDER BY start_date" + limitOffsetString;

	return executeQuery(queryString, [dateFormat, from]).then(function(rows) {
		var events = rows.map(function(x) {
			return {
				id: x.id,
				user_id: x.user_id,
				name: x.name,
				start_date: x.start_date
			};
		});

		return events;
	});
};

module.exports.reservationExists = function(user_id, event_id) {
	var queryString = "SELECT 1 from attends where user_id = ? AND event_id = ?";

	return executeQuery(queryString, [user_id, event_id]).then(function(rows) {
		if (rows && rows.length > 0) {
			return true
		} else {
			return false;
		}
	});
};

module.exports.cancelReservation = function(user_id, event_id) {
	var queryString = "DELETE from attends where user_id = ? AND event_id = ?";

	return executeQuery(queryString, [user_id, event_id]);
};

module.exports.createReservation = function(user_id, event_id) {
	var queryString = "INSERT INTO attends (user_id, event_id, reserved_at) VALUES (?, ?, ?)";

	return executeQuery(queryString, [user_id, event_id, new Date()]);
};

module.exports.listCompanyEvents = function(user_id, from, limit, offset) {
	var limitOffsetString = generateLimitOffsetString(limit, offset);

	var queryString = "select e.id, e.user_id, e.name, date_format(e.start_date, ?) as start_date, \
			(select count(user_id) from attends a where a.event_id = e.id) as num_people \
			from events e \
			WHERE e.start_date >= ? \
			AND e.user_id = ? \
			ORDER BY start_date" + limitOffsetString;

	return executeQuery(queryString, [dateFormat, from, user_id]).then(function(rows) {
		var events = rows.map(function(x) {
			return {
				id: x.id,
				name: x.name,
				start_date: x.start_date,
				number_of_attendees: x.num_people
			};
		});

		return events;
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
