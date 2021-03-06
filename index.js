'use strict';

const fs = require('fs');
const util = require('util');

const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const mustache = require('mustache');
const clone = require('reftools/lib/clone.js').clone;

const adaptor = require('./adaptor.js');

// allows other backends, such as a stream writer for .tar.gz files
let ff = {
    readFileSync: fs.readFileSync,
    createFile: fs.writeFileSync,
    rimraf: rimraf,
    mkdirp: mkdirp
};

function main(o, config, configName, callback) {
    let outputDir = config.outputDir || './out/';
    let verbose = config.defaults.verbose;
    config.defaults.configName = configName;
    adaptor.transform(o, config.defaults, function(err, model) {
        for (let p in config.partials) {
            let partial = config.partials[p];
            if (verbose) console.log('Processing partial '+partial);
            config.partials[p] = ff.readFileSync('./templates/'+configName+'/'+partial,'utf8');
        }
    
        let actions = [];
        for (let t in config.transformations) {
            let tx = config.transformations[t];
            if (tx.input) {
                if (verbose) console.log('Processing template '+tx.input);
                tx.template = ff.readFileSync('./templates/'+configName+'/'+tx.input,'utf8');
            }
            actions.push(tx);
        }
    
        if (verbose) console.log('Making/cleaning output directories');
        ff.mkdirp(outputDir+configName,function(){
            ff.rimraf(outputDir+configName+'/*',function(){
                if (config.directories) {
                    for (let directory of config.directories) {
                        ff.mkdirp.sync(outputDir+configName+'/'+directory);
                    }
                }
                for (let action of actions) {
                    if (verbose) console.log('Rendering '+action.output);
                    let content = mustache.render(action.template, model, config.partials);
                    ff.createFile(outputDir+configName+'/'+action.output,content,'utf8');
                }
                if (config.touch) {
                    let touchList = mustache.render(config.touch, model, config.partials);
                    let files = touchList.split('\r').join('').split('\n');
                    for (let file of files) {
                        file = file.trim();
                        if (file) {
                            if (!fs.existsSync(outputDir+configName+'/'+file)) {
                                ff.createFile(outputDir+configName+'/'+file,'','utf8');
                            }
                        }
                    }
                }
                if (config.apache) {
                    ff.createFile(outputDir+configName+'/LICENSE',ff.readFileSync('./templates/_common/LICENSE','utf8'),'utf8');
                }
                else {
                    ff.createFile(outputDir+configName+'/LICENSE',ff.readFileSync('./templates/_common/UNLICENSE','utf8'),'utf8');
                }
                let outer = model;
     
                if (config.perApi) {
                    let toplevel = clone(model);
                    delete toplevel.apiInfo;
                    for (let pa of config.perApi) {
                        for (let api of model.apiInfo.apis) {
                            let cApi = Object.assign({},config.defaults,toplevel,api);
                            let filename = mustache.render(pa.output,cApi,config.partials);
                            let template = ff.readFileSync('./templates/'+configName+'/'+pa.input,'utf8');
                            if (verbose) console.log('Rendering '+filename+' (dynamic)');
                            ff.createFile(outputDir+configName+'/'+filename,mustache.render(template,cApi,config.partials),'utf8');
                        }
                    }
                }

                if (config.perModel) {
                    let cModels = clone(model.models); 
                    for (let pm of config.perModel) {
                        for (let model of cModels) {
                            outer.models = [];
                            outer.models.push(model);
                            let filename = mustache.render(pm.output,outer,config.partials);
                            let template = ff.readFileSync('./templates/'+configName+'/'+pm.input,'utf8');
                            if (verbose) console.log('Rendering '+filename+' (dynamic)');
                            ff.createFile(outputDir+configName+'/'+filename,mustache.render(template,outer,config.partials),'utf8');
                        }
                    }
                }
    
                if (config.perOperation) { // now may not be necessary
                    for (let po of config.perOperation) {
                        for (let api of outer.apiInfo.apis) {
                            let cOperations = clone(api.operations);
                            for (let operation of cOperations) {
                                model.operations = [];
                                model.operations.push(operation);
                                let filename = mustache.render(po.output,outer,config.partials);
                                let template = ff.readFileSync('./templates/'+configName+'/'+po.input,'utf8');
                                if (verbose) console.log('Rendering '+filename+' (dynamic)');
                                ff.createFile(outputDir+configName+'/'+filename,mustache.render(template,outer,config.partials),'utf8');
                            }
                        }
                    }
                }

                if (callback) callback(null,true);
            });
        });
    });
}

module.exports = {
    fileFunctions: ff,
    main : main
};

