const Ajv = require('ajv');
const ajv = new Ajv({allErrors:true,allowUnionTypes:true});

const userSchema = {
	type: 'object',
	required: ['username','password'],
	additionalProperties: false,
	properties: {
		username: {type:'string', minLength:1},
		password: {type:'string', minLength:1}
	}
};

const shareSchema = {
	type: 'object',
	required: ['name','path'],
	additionalProperties: false,
	properties: {
		name: {type:'string', pattern: '^[^/\\]+$'},
		path: {type:'string', minLength:1},
		public: {type:'boolean'},
		anonymousPermission: {enum:['r','rw']},
		maxSizeBytes: {type:['integer','null'], minimum:0},
		users: {type:'object', additionalProperties:{enum:['r','rw']}}
	}
};

const serverSchema = {
	type:'object',
	additionalProperties: true,
	properties: {
		host: {type:'string'},
		port: {type:'integer', minimum:1, maximum:65535},
		anonymous: {type:'object', additionalProperties:false, properties:{enabled:{type:'boolean'}}},
		limits: {type:'object', additionalProperties:false, properties:{maxUploadBytes:{type:['integer','null'], minimum:0}}},
		pasv: {type:'object', additionalProperties:false, properties:{enabled:{type:'boolean'}, url:{type:'string'}, min:{type:'integer'}, max:{type:'integer'}}},
		tls: {type:'object', additionalProperties:true, properties:{enabled:{type:'boolean'}, mode:{enum:['explicit','implicit']}, cert:{type:'string'}, key:{type:'string'}}},
		locale: {type:'string'},
		fallbackLocale: {type:'string'}
	}
};

const validateUsers = ajv.compile({type:'array', items:userSchema});
const validateShares = ajv.compile({type:'array', items:shareSchema});
const validateServer = ajv.compile(serverSchema);

function formatErrors(errors){
	return errors.map(e=>`${e.instancePath || '/'} ${e.message}`).join('; ');
}

function validateAll({users, shares, serverConf}){
	if(!validateUsers(users)) throw new Error('users.json invalid: '+formatErrors(validateUsers.errors));
	if(!validateShares(shares)) throw new Error('shares.json invalid: '+formatErrors(validateShares.errors));
	if(!validateServer(serverConf)) throw new Error('server.json invalid: '+formatErrors(validateServer.errors));
}

module.exports = { validateAll };
