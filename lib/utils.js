'use strict';

const crypto = require('crypto');

const utils = {
	extractTags,
	encrypt,
	normalize
};

function extractTags(text) {
	if (text == null) return [];

	let matches = text.match(/#(\w+)/g);

	if (matches === null) return [];

	matches = matches.map(normalize);

	return matches;
}

function normalize(text) {
	text = text.toLowerCase();
	text = text.replace(/#/g, '');
	return text;
}

function encrypt(password) {
	let shasun = crypto.createHash('sha256');
	shasun.update(password);
	return shasun.digest('hex');
}

module.exports = utils;
