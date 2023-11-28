//. app.js
var express = require( 'express' ),
    axiosBase = require( 'axios' ),
    bodyParser = require( 'body-parser' ),
    ejs = require( 'ejs' ),
    formData = require( 'express-form-data' ),
    app = express();

require( 'dotenv' ).config();

// Prompts
var instruction = 'WATSONX_INSTRUCTION' in process.env ? process.env.WATSONX_INSTRUCTION : '';
instruction = instruction.split( "\\n" ).join( "\n" );
var pre_input = 'WATSONX_PRE_INPUT' in process.env ? process.env.WATSONX_PRE_INPUT : '';
pre_input = pre_input.split( "\\n" ).join( "\n" );
var post_input = 'WATSONX_POST_INPUT' in process.env ? process.env.WATSONX_POST_INPUT : '';
post_input = post_input.split( "\\n" ).join( "\n" );

//. env values
var settings_watsonx_apikey = 'WATSONX_API_KEY' in process.env ? process.env.WATSONX_API_KEY : ''; 
var settings_watsonx_project_id = 'WATSONX_PROJECT_ID' in process.env ? process.env.WATSONX_PROJECT_ID : ''; 
var settings_watsonx_model_id = 'WATSONX_MODEL_ID' in process.env ? process.env.WATSONX_MODEL_ID : ''; 

var settings_port = 'PORT' in process.env ? process.env.PORT : 8080; 
var settings_cors = 'CORS' in process.env ? process.env.CORS : ''; 

var IGNORE_PHRASE = 5;  //. 結果の最初のフレーズがこの長さ以下だったら無視する

app.use( express.static( __dirname + '/public' ) );
app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( formData.parse( { autoClean: true } ) );
app.use( formData.format() );
app.use( express.Router() );
app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

app.all( '/*', function( req, res, next ){
  if( settings_cors ){
    var origin = req.headers.origin;
    if( origin ){
      var cors = settings_cors.split( " " ).join( "" ).split( "," );

      //. cors = [ "*" ] への対応が必要
      if( cors.indexOf( '*' ) > -1 ){
        res.setHeader( 'Access-Control-Allow-Origin', '*' );
        res.setHeader( 'Access-Control-Allow-Methods', '*' );
        res.setHeader( 'Access-Control-Allow-Headers', '*' );
        res.setHeader( 'Vary', 'Origin' );
      }else{
        if( cors.indexOf( origin ) > -1 ){
          res.setHeader( 'Access-Control-Allow-Origin', origin );
          res.setHeader( 'Access-Control-Allow-Methods', '*' );
          res.setHeader( 'Access-Control-Allow-Headers', '*' );
          res.setHeader( 'Vary', 'Origin' );
        }
      }
    }
  }
  next();
});

app.get( '/', function( req, res ){
  res.render( 'index', {} );
});


async function getAccessToken( apikey ){
  return new Promise( function( resolve, reject ){
    if( apikey ){
      var axios = axiosBase.create({
        baseURL: 'https://iam.cloud.ibm.com',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      var params = new URLSearchParams();
      params.append( 'grant_type', 'urn:ibm:params:oauth:grant-type:apikey' );
      params.append( 'apikey', apikey );

      axios.post( '/identity/token', params )
      .then( function( result ){
        if( result && result.data && result.data.access_token ){
          //console.log( 'access_token = ' + result.data.access_token );
          resolve( { status: true, access_token: result.data.access_token } );
        }else{
          resolve( { status: true, access_token: result.data.access_token } );
          resolve( { status: false, error: 'no access_token retrieved.' } );
        }
      }).catch( function( err ){
        console.log( {err} );
        resolve( { status: false, error: err } );
      });
    }else{
      resolve( { status: false, error: 'no apikey provided.' } );
    }
  });
}

async function getModels( access_token, project_id ){
  return new Promise( function( resolve, reject ){
    if( access_token ){
      if( project_id ){
        var axios = axiosBase.create({
          baseURL: 'https://us-south.ml.cloud.ibm.com',
          responseType: 'json',
          headers: {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });

        var data = {
          'project_id': project_id 
        };

        //axios.post( '/ml/v1-beta/models?version=2023-05-29', data )
        //axios.get( '/ml/v1-beta/models?version=2023-05-29' )
      //  axios.get( '/ml/v1-beta/retrieve/models?version=2023-05-29' )
        axios.get( '/ml/v1-beta/list/models?version=2023-05-29' )
        .then( function( result ){
          console.log( {result} );
          if( result && result.data && result.data.results ){
            resolve( { status: true, results: result.data.results } );
          }else{
            resolve( { status: false, error: 'no results found.' } );
          }
        }).catch( function( err ){
          console.log( {err} );
          resolve( { status: false, error: err } );
        });
      }else{
        resolve( { status: false, error: 'Parameter project_id is not provided.' } );
      }
    }else{
      resolve( { status: false, error: 'access_token is null.' } );
    }
  });
}

async function generateText( access_token, project_id, model_id, input, max_new_tokens = 100 ){
  return new Promise( function( resolve, reject ){
    if( access_token ){
      if( project_id && input && max_new_tokens ){
        var axios = axiosBase.create({
          baseURL: 'https://us-south.ml.cloud.ibm.com',
          responseType: 'json',
          headers: {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });

        var prompt = instruction + "\n\n" + pre_input + input + post_input;
        //console.log( {prompt} );
        var data = {
          'model_id': model_id,
          'input': prompt, 
          'parameters': {
            "decoding_method": "greedy",
            "max_new_tokens": max_new_tokens,
            "min_new_tokens": 0,
            "stop_sequences": [],
            "repetition_penalty": 1
          },
          'project_id': project_id 
        };

        axios.post( '/ml/v1-beta/generation/text?version=2023-05-29', data )
        .then( function( result ){
          //console.log( {result} );
          if( result && result.data && result.data.results ){
            resolve( { status: true, results: result.data.results } );
          }else{
            resolve( { status: false, error: 'no results found.' } );
          }
        }).catch( function( err ){
          console.log( {err} );
          resolve( { status: false, error: err } );
        });
      }else{
        resolve( { status: false, error: 'Parameter project_id, model_id, input, and/or max_new_tokens are not provided.' } );
      }
    }else{
      resolve( { status: false, error: 'access_token is null.' } );
    }
  });
}

app.get( '/api/models', async function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  try{
    var apikey = ( req.query.apikey ? req.query.apikey : settings_watsonx_apikey );
    var project_id = ( req.query.project_id ? req.query.project_id : settings_watsonx_project_id );

    if( apikey && project_id ){
      var result0 = await getAccessToken( apikey );
      if( result0 && result0.status && result0.access_token ){
        var result = await getModels( result0.access_token, project_id );
        console.log( {result} );
        res.write( JSON.stringify( { status: true, models: result }, null, 2 ) );
        res.end();
      }else{
        console.log( result0.error );
        res.write( JSON.stringify( { status: true, generated_text: 'sorry. it seems like failed to get access token.' }, null, 2 ) );
        res.end();
      }
    }else{
      res.write( JSON.stringify( { status: true, generated_text: 'Oh, you need to specify credential parameter. For example, apikey, project id, model id, and input text.' }, null, 2 ) );
      res.end();
    }
  }catch( err ){
    console.log( {err} );
    res.write( JSON.stringify( { status: true, generated_text: 'Sorry. Unknwn error detected.' }, null, 2 ) );
    res.end();
  }
});

app.post( '/api/generate_text', async function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var input = req.body.input;
  var max_new_tokens = ( req.body.max_new_tokens ? parseInt( req.body.max_new_tokens ) : 100 );

  try{
    var apikey = ( req.body.apikey ? req.body.apikey : settings_watsonx_apikey );
    var project_id = ( req.body.project_id ? req.body.project_id : settings_watsonx_project_id );
    var model_id = ( req.body.model_id ? req.body.model_id : settings_watsonx_model_id );
    if( apikey && project_id && model_id && input && max_new_tokens ){
      var result0 = await getAccessToken( apikey );
      if( result0 && result0.status && result0.access_token ){
        var result = await generateText( result0.access_token, project_id, model_id, input, max_new_tokens );
        if( result && result.status ){
          var results = result.results;
          if( results && results[0] && results[0].generated_text ){
            var generated_text = results[0].generated_text;
            var tmp = generated_text.split( '\\n' );
            if( tmp.length > 1 ){
              generated_text = tmp[0];
            }

            var n1 = generated_text.lastIndexOf( '[' );
            var n2 = generated_text.lastIndexOf( ']' );
            if( n1 > -1 ){
              if( n2 == -1 ){
                generated_text = generated_text.substr( 0, n1 - 1 );
              }else if( n1 > n2 ){
                generated_text = generated_text.substr( 0, n1 - 1 );
              }
            }else{
              if( n2 > -1 ){
                generated_text = generated_text.substr( n2 + 1 );
              }
            }

            var n = generated_text.indexOf( '[Friendly Assistant]' );
            if( n > -1 ){
              generated_text = generated_text.substr( n + 20 );
            }
            n = generated_text.indexOf( '[/Friendly Assistant]' );
            if( n > -1 ){
              generated_text = generated_text.substr( 0, n );
            }

            //console.log( {generated_text} );

            res.write( JSON.stringify( { status: true, generated_text: generated_text }, null, 2 ) );
            res.end();
          }else{
            res.write( JSON.stringify( { status: true, generated_text: 'no generated text found.' }, null, 2 ) );
            res.end();
          }
        }else{
          console.log( result.err );
          res.write( JSON.stringify( { status: true, generated_text: 'sorry. it seems like failed to generate text.' }, null, 2 ) );
          res.end();
        }
      }else{
        console.log( result0.error );
        res.write( JSON.stringify( { status: true, generated_text: 'sorry. it seems like failed to get access token.' }, null, 2 ) );
        res.end();
      }
    }else{
      res.write( JSON.stringify( { status: true, generated_text: 'Oh, you need to specify credential parameter. For example, apikey, project id, model id, and input text.' }, null, 2 ) );
      res.end();
    }
  }catch( err ){
    console.log( {err} );
    res.write( JSON.stringify( { status: true, generated_text: 'Sorry. Unknwn error detected.' }, null, 2 ) );
    res.end();
  }
});

app.listen( settings_port );
console.log( "server starting on " + settings_port + " ..." );
