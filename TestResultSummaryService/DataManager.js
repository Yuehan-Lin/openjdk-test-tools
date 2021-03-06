const { TestResultsDB, OutputDB } = require( './Database' );
const ObjectID = require( 'mongodb' ).ObjectID;
const Parsers = require( `./parsers/` );
const DefaultParser = require( `./parsers/Default` );
const { logger } = require( './Utils' );

class DataManager {
    findParserType( buildName, output ) {
        const keys = Object.keys( Parsers );
        for ( let i = 0; i < keys.length; i++ ) {
            const type = keys[i];
            if ( Parsers[type].canParse( buildName, output ) ) {
                return type;
            }
        }
    }

    async parseOutput( buildName, output ) {
        let parserType = this.findParserType( buildName, output );
        let parser;
        if ( parserType ) {
            parser = new Parsers[parserType]( buildName );
        } else {
            parser = new DefaultParser();
            parserType = "Default";
        }
        const obj = await parser.parse( output );
        return { parserType, ...obj };
    }

    async updateOutput( data ) {
        const { id, output } = data;
        const outputDB = new OutputDB();
        if ( id ) {
            const result = await outputDB.update( { _id: new ObjectID( id ) }, { $set: { output } } );
            return id;
        } else {
            const status = await outputDB.populateDB( { output } );
            if ( status && status.insertedCount === 1 ) {
                return status.insertedIds[0];
            }
        }
        return -1;
    }

    async updateBuild( data ) {
        logger.verbose( "updateBuild", data );
        const { _id, buildName, ...newData } = data;
        const criteria = { _id: new ObjectID( _id ) };
        const update = {
            ...newData
        };
        const testResults = new TestResultsDB();
        const result = await testResults.update( criteria, { $set: update } );
    }

    async updateBuildWithOutput( data ) {
        logger.verbose( "updateBuildWithOutput", data.buildName, data.buildNum );
        const { _id, buildName, output, ...newData } = data;
        const criteria = { _id: new ObjectID( _id ) };
        const { builds, tests, build, ...value } = await this.parseOutput( buildName, output );
        const testResults = new TestResultsDB();
        const outputDB = new OutputDB();
        let update = {
            ...newData,
            ...value
        };
        logger.debug( "update newData", update );

        if ( builds && builds.length > 0 ) {
            builds.map( async b => {
                const childBuild = {
                    url: data.url,
                    buildName: b.buildName,
                    buildNameStr: b.buildNameStr,
                    buildNum: parseInt( b.buildNum, 10 ),
                    parentId: _id,
                    type: b.type,
                    status: "NotDone"
                };
                const id = await this.createBuild( childBuild );
            } );

            const outputData = {
                id: data.buildOutputId ? data.buildOutputId : null,
                output,
            };
            // store output
            const outputId = await this.updateOutput( outputData );
            if ( !data.buildOutputId && outputId !== -1 ) {
                update.buildOutputId = outputId;
            }
            update.hasChildren = true;
            const result = await testResults.update( criteria, { $set: update } );
        } else if ( tests && tests.length > 0 ) {
            const testsObj = await Promise.all( tests.map( async ( { testOutput, ...test } ) => {
                let testOutputId = null;
                if ( testOutput ) {
                    const status = await outputDB.populateDB( { output: testOutput } );
                    if ( status && status.insertedCount === 1 ) {
                        testOutputId = status.insertedIds[0];
                    }
                }
                return {
                    _id: new ObjectID(),
                    testOutputId,
                    ...test
                };
            } ) );
            update.tests = testsObj;
            update.hasChildren = false;
            const result = await testResults.update( criteria, { $set: update } );
        } else if ( build === null ) {
            let buildOutputId = null;
            let response = await outputDB.populateDB( { output: output } );
            if ( response && response.insertedCount === 1 ) {
                buildOutputId = response.insertedIds[0];
            }
            update.buildOutputId = buildOutputId;
            update.hasChildren = false;
            const result = await testResults.update( criteria, { $set: update } );
        }
    }

    // create build only if the build does not exist in database
    async createBuild( data ) {
        const { url, buildName, buildNum } = data;
        const testResults = new TestResultsDB();
        const result = await testResults.getData( { url, buildName, buildNum } ).toArray();
        if ( result && result.length === 0 ) {
            const status = await testResults.populateDB( data );

            if ( status && status.insertedCount === 1 ) {
                logger.debug( "createBuild", data.buildName, data.buildNum );
                return status.insertedIds[0];
            }
            return -1;
        }
    }
}

module.exports = DataManager;