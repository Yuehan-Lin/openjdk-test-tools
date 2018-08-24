const Promise = require( 'bluebird' );
const BuildProcessor = require( './BuildProcessor' );
const BuildMonitor = require( './BuildMonitor' );
const { TestResultsDB, BuildListDB } = require( './Database' );
const { logger } = require( './Utils' );

const elapsed = [2, 5, 1 * 60, 2 * 60, 5 * 60, 30 * 60];

class EventHandler {

    async processBuild() {
        let count = 0;
        // break if all builds are done for consecutively 5 queries
        while ( true ) {
            try {
                const testResults = new TestResultsDB();
                const tasks = await testResults.getData( { status: { $ne: "Done" } } ).toArray();
                if ( !tasks || tasks.length === 0 ) {
                    count++;
                } else {
                    count = 0;
                }
                for ( let task of tasks ) {
                    try {
                        const buildProcessor = new BuildProcessor();
                        await buildProcessor.execute( task );
                    } catch ( e ) {
                        logger.error( "Exception in BuildProcessor: ", e );
                    }
                }
            } catch ( e ) {
                logger.error( "Exception in database query: ", e );
            }
            const elapsedTime = elapsed[Math.min( count, elapsed.length - 1 )];
            logger.verbose( `processBuild is waiting for ${elapsedTime} sec` );
            await Promise.delay( elapsedTime * 1000 );
        }
    }

    //this function monitors build in Jenkins
    async monitorBuild() {
        while ( true ) {
            try {
                const testResults = new BuildListDB();
                const tasks = await testResults.getData().toArray();
                if ( tasks && tasks.length > 0 ) {
                    for ( let task of tasks ) {
                        try {
                            const buildMonitor = new BuildMonitor();
                            await buildMonitor.execute( task );
                        } catch ( e ) {
                            logger.error( "Exception in BuildMonitor: ", e );
                        }
                    }
                }
            } catch ( e ) {
                logger.error( "Exception in database query: ", e );
            }
            const elapsedTime = 15 * 60;
            logger.verbose( `monitorBuild is waiting for ${elapsedTime} sec` );
            await Promise.delay( elapsedTime * 1000 );
        }
    }
}
module.exports = EventHandler;