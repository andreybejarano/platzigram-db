'use strict';
const r = require('rethinkdb');
const utils = require('./utils');
const uuid = require('uuid-base62');

const defaults = {
	host: 'localhost',
	port: 28015,
	db: 'platzigram'
};

class Db {
	constructor(options) {
		options = options || {};
		this.host = options.host || defaults.host;
		this.port = options.port || defaults.port;
		this.db = options.db || defaults.db;
		this.setup = options.setup || false;
	}

	connect() {
		let db = this.db;
		let setup = async function (connection) {
			try {
				let conn = await connection;
				let dbList = await r.dbList().run(conn);
				if (dbList.indexOf(db) === -1) {
					await r.dbCreate(db).run(conn);
				}
				let dbTables = await r.db(db).tableList().run(conn);
				if (dbTables.indexOf('images') === -1) {
					await r.db(db).tableCreate('images').run(conn);
					await r.db(db).table('images').indexCreate('createdAt').run(conn);
					await r.db(db).table('images').indexCreate('userId', { multi: true }).run(conn);
				}

				if (dbTables.indexOf('users') === -1) {
					await r.db(db).tableCreate('users').run(conn);
					await r.db(db).table('users').indexCreate('username').run(conn);
				}
				return conn;
			} catch (error) {
				throw new Error(error);
			}
		};

		return new Promise((resolve, reject) => {
			this.connection = r.connect({
				host: this.host,
				port: this.port
			});
			this.connection.then(conn => {
				try {
					this.connected = true;
					if (!this.setup) {
						resolve(this.connection);
					} else {
						resolve(setup(this.connection));
					}
				} catch (error) {
					this.connected = false;
					reject(error);
				}
			}).error((err) => {
				reject(err);
			});
		});
	}

	disconnect() {
		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					conn.close().then(() => {
						this.connected = false;
						resolve('Disconected Ok');
					}).error(err => {
						reject(new Error(err));
					});
				});
			}
		});
	}

	saveImage(image) {
		let connection = this.connection;
		let db = this.db;
		let task = async function () {
			let conn = await connection;
			image.createdAt = new Date();
			image.tags = utils.extractTags(image.description);

			let result = await r.db(db).table('images').insert(image).run(conn);

			if (result.errors > 0) {
				throw new Error(result.first_error);
			}

			image.id = result.generated_keys[0];

			await r.db(db).table('images').get(image.id).update({
				publicId: uuid.encode(image.id)
			}).run(conn);

			let created = await r.db(db).table('images').get(image.id).run(conn);

			return created;
		};

		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					try {
						resolve(task());
					} catch (err) {
						reject(new Error(err));
					}
				});
			}
		});
	}

	likeImage(id) {
		let connection = this.connection;
		let db = this.db;
		let getImage = this.getImage.bind(this);
		let task = async function () {
			let conn = await connection;

			let image = await getImage(id);

			await r.db(db).table('images').get(image.id).update({
				liked: true,
				likes: image.likes + 1
			}).run(conn);

			let created = await r.db(db).table('images').get(image.id).run(conn);

			return created;
		};

		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					try {
						resolve(task());
					} catch (err) {
						reject(new Error(err));
					}
				});
			}
		});
	}

	getImage(id) {
		let connection = this.connection;
		let db = this.db;
		let imageId = uuid.decode(id);
		let task = async function () {
			let conn = await connection;

			let image = await r.db(db).table('images').get(imageId).run(conn);

			if (!image) {
				throw new Error(`image ${imageId} not found`);
			}
			return image;
		};

		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					try {
						resolve(task());
					} catch (err) {
						reject(new Error(err));
					}
				});
			}
		});
	}

	getImages() {
		let connection = this.connection;
		let db = this.db;
		let task = async function () {
			let conn = await connection;

			let images = await r.db(db).table('images').orderBy({
				index: r.desc('createdAt')
			}).run(conn);

			let result = await images.toArray();

			return result;
		};

		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					try {
						resolve(task());
					} catch (err) {
						reject(new Error(err));
					}
				});
			}
		});
	}

	saveUser(user) {
		let connection = this.connection;
		let db = this.db;
		let task = async function () {
			let conn = await connection;
			user.password = utils.encrypt(user.password);
			user.createdAt = new Date();

			let result = await r.db(db).table('users').insert(user).run(conn);

			if (result.errors > 0) {
				throw new Error(result.first_error);
			}

			user.id = result.generated_keys[0];

			let created = await r.db(db).table('users').get(user.id).run(conn);

			return created;
		};

		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					try {
						resolve(task());
					} catch (err) {
						reject(new Error(err));
					}
				});
			}
		});
	}

	getUser(username) {
		let connection = this.connection;
		let db = this.db;
		let task = async function () {
			let conn = await connection;

			await r.db(db).table('users').indexWait().run(conn);
			let users = await r.db(db).table('users').getAll(username, {
				index: 'username'
			}).run(conn);

			let result = null;

			try {
				result = await users.next();
			} catch (e) {
				throw new Error(`user ${username} not found`);
			}

			if (result.errors > 0) {
				throw new Error(result.first_error);
			}

			return result;
		};

		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					try {
						resolve(task());
					} catch (err) {
						reject(new Error(err));
					}
				});
			}
		});
	}

	authenticate(username, password) {
		let getUser = this.getUser.bind(this);
		let task = async function () {
			let user = null;
			try {
				user = await getUser(username);
			} catch (e) {
				return false;
			}
			return user.password === utils.encrypt(password);
		};

		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					try {
						resolve(task());
					} catch (err) {
						reject(new Error(err));
					}
				});
			}
		});
	}

	getImagesByUser(userId, password) {
		let connection = this.connection;
		let db = this.db;
		let task = async function () {
			let conn = await connection;

			await r.db(db).table('images').indexWait().run(conn);

			let images = await r.db(db).table('images').getAll(userId, {
				index: 'userId'
			}).orderBy(r.desc('createdAt')).run(conn);

			let result = await images.toArray();

			return result;
		};

		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					try {
						resolve(task());
					} catch (err) {
						reject(new Error(err));
					}
				});
			}
		});
	}

	getImagesByTag(tag) {
		let connection = this.connection;
		let db = this.db;
		tag = utils.normalize(tag);
		let task = async function () {
			let conn = await connection;

			await r.db(db).table('images').indexWait().run(conn);

			let images = await r.db(db).table('images').filter((img) => {
				return img('tags').contains(tag);
			}).orderBy(r.desc('createdAt')).run(conn);

			let result = await images.toArray();

			return result;
		};

		return new Promise((resolve, reject) => {
			if (!this.connected) {
				reject(new Error('not connected'));
			} else {
				this.connection.then(conn => {
					try {
						resolve(task());
					} catch (err) {
						reject(new Error(err));
					}
				});
			}
		});
	}
}

module.exports = Db;
