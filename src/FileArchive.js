import path       from 'path';
import fs         from 'fs-extra';

import archiver   from 'archiver';

/**
 * FileArchive - Provides several utility methods for archiving, copying, and writing files.
 */
export default class FileArchive
{
   /**
    * Stores the stack of archiver instances.
    *
    * @type {Array}
    * @private
    */
   #archiverStack = [];

   /**
    * Provides a unique counter for temporary archives.
    *
    * @type {number}
    * @private
    */
   #archiveCntr = 0;

   /**
    * Stores FileArchive options.
    *
    * @type {FileArchiveOptions}
    * @private
    */
   #options = {
      compressFormat: 'tar.gz',
      lockRelative: false,
      logEvent: 'log:debug',
      relativePath: void 0
   };

   /**
    * Instantiate FileArchive.
    *
    * @param {object}               [eventbus] - An optional @typhonjs-plugin Eventbus instance.
    *
    * @param {FileArchiveOptions}   [options] - FileArchiveOptions to set.
    */
   constructor({eventbus, ...options} = {})
   {
      if (eventbus !== void 0 && typeof eventbus !== 'object') { throw new TypeError(`'eventbus' is not an object.`); }
      if (typeof options !== 'object') { throw new TypeError(`'options' is not an object.`); }

      /**
       * Eventbus instance.
       *
       * @type {object}
       * @private
       */
      this._eventbus = eventbus;

      this.setOptions(options);
   }

   /**
    * Create a compressed archive relative to the output destination. All subsequent file write and copy operations
    * will add to the existing archive. You must invoke `archiveFinalize` to complete the archive process.
    *
    * @param {object}   opts - Optional parameters.
    *
    * @param {string}   opts.filePath - Destination file path; the compression format extension will be appended.
    *
    * @param {boolean}  [opts.addToParent=true] - If a parent archiver exists then add child archive to it and delete
    *                                             local file.
    *
    * @param {string}   [opts.logPrepend=''] - A string to prepend any logged output.
    *
    * @param {boolean}  [opts.silent=false] - When true `output: <destPath>` is logged.
    */
   archiveCreate({ filePath, addToParent = true, logPrepend = '', silent = false } = {})
   {
      if (typeof filePath !== 'string') { throw new TypeError(`'filePath' is not a 'string'.`); }
      if (typeof addToParent !== 'boolean') { throw new TypeError(`'addToParent' is not a 'boolean'.`); }
      if (typeof logPrepend !== 'string') { throw new TypeError(`'logPrepend' is not a 'string'.`); }
      if (typeof silent !== 'boolean') { throw new TypeError(`'silent' is not a 'boolean'.`); }

      const compressFormat = this.#options.compressFormat;

      // Add archive format to `filePath`.
      filePath = `${filePath}.${compressFormat}`;

      if (!silent && this._eventbus)
      {
         this._eventbus.trigger(this.#options.logEvent, `${logPrepend}creating archive: ${filePath}`);
      }

      let resolvedPath = this.#options.relativePath ? path.resolve(this.#options.relativePath, filePath) :
       path.resolve(filePath);

      // If a child archive is being created, `addToParent` is false then change the resolved destination to a
      // temporary file so that the parent instance can add it before finalizing.
      if (this.#archiverStack.length > 0 && addToParent)
      {
         const dirName = path.dirname(resolvedPath);

         resolvedPath = `${dirName}${path.sep}.temp-${this.#archiveCntr++}`;
      }

      let archive;

      switch (compressFormat)
      {
         case 'tar.gz':
            archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });
            break;

         case 'zip':
            archive = archiver('zip', { zlib: { level: 9 } });
            break;

         default:
            throw new Error(`Unknown compression format: '${compressFormat}'.`);
      }

      // Make sure the resolved destination is a valid directory; if not create it...
      fs.ensureDirSync(path.dirname(resolvedPath));

      const stream = fs.createWriteStream(resolvedPath);

      // Catch any archiver errors.
      archive.on('error', (err) => { throw err; });

      // Pipe archive data to the file.
      archive.pipe(stream);

      // Create an archive instance holding relevant data for tracking children archives.
      const instance =
      {
         archive,
         filePath,
         resolvedPath,
         stream,
         addToParent,
         childPromises: []
      };

      this.#archiverStack.push(instance);
   }

   /**
    * Finalizes an active archive. You must first invoke `archiveCreate`.
    *
    * @param {object}   [opts] - Optional parameters.
    *
    * @param {string}   [opts.logPrepend=''] - A string to prepend any logged output.
    *
    * @param {boolean}  [opts.silent=false] - When true `output: <destPath>` is logged.
    *
    * @returns {Promise} - A resolved promise is returned which is triggered once archive finalization completes.
    */
   async archiveFinalize({ logPrepend = '', silent = false } = {})
   {
      if (typeof silent !== 'boolean') { throw new TypeError(`'silent' is not a 'boolean'.`); }

      const instance = this.#popArchive();

      if (instance !== null)
      {
         const parentInstance = this.#getArchive();

         // If `addToParent` is true and there is a parent instance then push a new Promise into the parents
         // `childPromises` array and add callbacks to the current instances file stream to resolve the Promise.
         if (instance.addToParent && parentInstance !== null)
         {
            parentInstance.childPromises.push(new Promise((resolve, reject) =>
            {
               // Add event callbacks to instance stream such that on close the Promise is resolved.
               instance.stream.on('close', () =>
               {
                  resolve({ resolvedPath: instance.resolvedPath, filePath: instance.filePath });
               });

               // Any errors will reject the promise.
               instance.stream.on('error', reject);
            }));
         }

         if (!silent && this._eventbus)
         {
            this._eventbus.trigger(this.#options.logEvent, `${logPrepend}finalizing archive: ${instance.filePath}`);
         }

         // Resolve any child promises before finalizing current instance.
         await Promise.all(instance.childPromises).then((results) =>
         {
            // There are temporary child archives to insert into the current instance.
            for (const result of results)
            {
               // Append temporary archive to requested relative filePath.
               instance.archive.append(fs.createReadStream(result.resolvedPath), { name: result.filePath });

               // Remove temporary archive.
               fs.removeSync(result.resolvedPath);
            }
         });

         // Create a promise for current instance stream to close.
         const promise = new Promise((resolve, reject) =>
         {
            // Add event callbacks to instance stream such that on close the Promise is resolved.
            instance.stream.on('close', () =>
            {
               resolve();
            });

            // Any errors will reject the promise.
            instance.stream.on('error', reject);
         });

         // finalize the archive (ie we are done appending files but streams have to finish yet)
         instance.archive.finalize();

         return promise;
      }
      else
      {
         if (!silent && this._eventbus)
         {
            this._eventbus.trigger(this.#options.logEvent, `${logPrepend}No active archive to finalize.`);
         }
      }
   }

   /**
    * Copy a source path / to destination path or relative path.
    *
    * @param {object}   opts - Optional parameters.
    *
    * @param {string}   opts.srcPath - Source path.
    *
    * @param {string}   opts.destPath - Destination path.
    *
    * @param {string}   [opts.logPrepend=''] - A string to prepend any logged output.
    *
    * @param {boolean}  [opts.silent=false] - When true `output: <destPath>` is logged.
    */
   copy({ srcPath, destPath, logPrepend = '', silent = false } = {})
   {
      if (typeof srcPath !== 'string') { throw new TypeError(`'srcPath' is not a 'string'.`); }
      if (typeof destPath !== 'string') { throw new TypeError(`'destPath' is not a 'string'.`); }
      if (typeof logPrepend !== 'string') { throw new TypeError(`'logPrepend' is not a 'string'.`); }
      if (typeof silent !== 'boolean') { throw new TypeError(`'silent' is not a 'boolean'.`); }

      if (!silent && this._eventbus)
      {
         this._eventbus.trigger(this.#options.logEvent, `${logPrepend}copied: ${destPath}`);
      }

      const instance = this.#getArchive();

      if (instance !== null)
      {
         if (fs.statSync(srcPath).isDirectory())
         {
            instance.archive.directory(srcPath, destPath);
         }
         else
         {
            instance.archive.file(srcPath, { name: destPath });
         }
      }
      else
      {
         fs.copySync(srcPath, this.#options.relativePath ? path.resolve(this.#options.relativePath, destPath) :
          path.resolve(destPath));
      }
   }

   /**
    * Empties the resolved relative directory if one is set and it is different from the current working directory.
    *
    * @param {object}   opts - Optional parameters.
    *
    * @param {string}   [opts.logPrepend=''] - A string to prepend any logged output.
    *
    * @param {boolean}  [opts.silent=false] - When true logging is disabled.
    */
   emptyRelativePath({ logPrepend = '', silent = false } = {})
   {
      if (this.#options.relativePath)
      {
         const resolvedPath = path.resolve(this.#options.relativePath);

         // Do not empty path if resolvedPath is at or below the current working directory.
         if (process.cwd().startsWith(resolvedPath))
         {
            if (!silent && this._eventbus)
            {
               this._eventbus.trigger(this.#options.logEvent,
                `${logPrepend}FileArchive.emptyRelativePath: aborting as current working directory will be deleted.`);
            }
         }
         else
         {
            if (!silent && this._eventbus)
            {
               this._eventbus.trigger(this.#options.logEvent, `${logPrepend}emptying: ${this.#options.relativePath}`);
            }

            fs.emptyDirSync(path.resolve(this.#options.relativePath));
         }
      }
      else
      {
         if (!silent && this._eventbus)
         {
            this._eventbus.trigger(this.#options.logEvent,
             `${logPrepend}FileArchive.emptyRelativePath: no relative path to empty.`);
         }
      }
   }

   /**
    * Gets the current archiver instance.
    *
    * @returns {*}
    */
   #getArchive()
   {
      return this.#archiverStack.length > 0 ? this.#archiverStack[this.#archiverStack.length - 1] : null;
   }

   /**
    * Returns a copy of the FileArchive options.
    *
    * @returns {FileArchiveOptions} - FileArchive options.
    */
   getOptions()
   {
      return JSON.parse(JSON.stringify(this.#options));
   }

   /**
    * Pops an archiver instance off the stack.
    *
    * @returns {*}
    */
   #popArchive()
   {
      return this.#archiverStack.length > 0 ? this.#archiverStack.pop() : null;
   }

   /**
    * Set optional parameters.
    *
    * @param {FileArchiveOptions} options - Defines optional parameters to set.
    */
   setOptions(options = {})
   {
      if (typeof options !== 'object') { throw new TypeError(`'options' is not an 'object'.`); }

      if (!this.#options.lockRelative && typeof options.relativePath === 'string')
      {
         this.#options.relativePath = options.relativePath;
      }

      // Only set `lockRelative` if it already has not been set to true.
      if (!this.#options.lockRelative && typeof options.lockRelative === 'boolean')
      {
         this.#options.lockRelative = options.lockRelative;
      }

      if (typeof options.compressFormat === 'string') { this.#options.compressFormat = options.compressFormat; }
      if (typeof options.logEvent === 'string') { this.#options.logEvent = options.logEvent; }
   }

   /**
    * Write a file to file path or relative path.
    *
    * @param {object}   fileData - The file data.
    *
    * @param {string}   filePath - A relative file path and name to `config.destination`.
    *
    * @param {string}   [logPrepend=''] - A string to prepend any logged output.
    *
    * @param {boolean}  [silent=false] - When true `output: <destPath>` is logged.
    *
    * @param {string}   [encoding='utf8'] - The encoding type.
    */
   writeFile({ fileData, filePath, logPrepend = '', silent = false, encoding = 'utf8' } = {})
   {
      if (typeof filePath !== 'string') { throw new TypeError(`'filePath' is not a 'string'.`); }
      if (typeof silent !== 'boolean') { throw new TypeError(`'silent' is not a 'boolean'.`); }
      if (typeof encoding !== 'string') { throw new TypeError(`'encoding' is not a 'string'.`); }
      if (typeof fileData === 'undefined' || fileData === null)
      {
         throw new TypeError(`'filePath' is not a 'string'.`);
      }

      if (!silent && this._eventbus)
      {
         this._eventbus.trigger(this.#options.logEvent, `${logPrepend}output: ${filePath}`);
      }

      const instance = this.#getArchive();

      if (instance !== null)
      {
         instance.archive.append(fileData, { name: filePath });
      }
      else
      {
         // If this.#options.relativePath is defined then resolve the relative path against filePath.
         fs.outputFileSync(this.#options.relativePath ? path.resolve(this.#options.relativePath, filePath) : filePath,
          fileData, { encoding });
      }
   }

   /**
    * Adds event bindings for FileArchive via `@typhonjs-plugin/manager`.
    *
    * @param {object} ev - PluginInvokeEvent - A plugin event.
    * @ignore
    */
   onPluginLoad(ev)
   {
      const eventbus = ev.eventbus;

      this._eventbus = eventbus;

      let eventPrepend = 'typhonjs:';

      const options = ev.pluginOptions;

      // Apply any plugin options.
      if (typeof options === 'object')
      {
         this.setOptions(options);

         // If `eventPrepend` is defined then it is prepended before all event bindings.
         if (typeof options.eventPrepend === 'string') { eventPrepend = `${options.eventPrepend}:`; }
      }

      eventbus.on(`${eventPrepend}utils:file:archive:create`, this.archiveCreate, this);
      eventbus.on(`${eventPrepend}utils:file:archive:finalize`, this.archiveFinalize, this);
      eventbus.on(`${eventPrepend}utils:file:archive:copy`, this.copy, this);
      eventbus.on(`${eventPrepend}utils:file:archive:options:get`, this.getOptions, this);
      eventbus.on(`${eventPrepend}utils:file:archive:options:set`, this.setOptions, this);
      eventbus.on(`${eventPrepend}utils:file:archive:path:relative:empty`, this.emptyRelativePath, this);
      eventbus.on(`${eventPrepend}utils:file:archive:write`, this.writeFile, this);
   }
}