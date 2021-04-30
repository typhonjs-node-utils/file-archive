import { assert }    from 'chai';
import fs            from 'fs-extra';

import FileArchive   from '../../src/FileArchive.js';

const fileArchive = new FileArchive({ relativePath: './test/fixture' });

// Empty test fixture directory.
fs.emptydirSync('./test/fixture');

// Note: to prevent `./test/fixture` from being emptied at the end of testing comment out the last test
// `emptyRelativePath`.
//   writeFile({ fileData, filePath, silent = false, encoding = 'utf8' } = {})

describe('FileUtil:', () =>
{
   it('writeFile', () =>
   {
      fileArchive.writeFile({ fileData: writeData, filePath: 'test.js' });
      fileArchive.writeFile({ fileData: writeData, filePath: 'test2.js' });

      assert.isTrue(fs.existsSync('./test/fixture/test.js'));
      assert.isTrue(fs.existsSync('./test/fixture/test2.js'));

      const readData = fs.readFileSync('./test/fixture/test.js').toString();
      const readData2 = fs.readFileSync('./test/fixture/test2.js').toString();

      assert.strictEqual(readData, writeData);
      assert.strictEqual(readData2, writeData);
   });

   it('copy', () =>
   {
      fileArchive.copy({ srcPath: './test/fixture/test.js', destPath: 'test3.js' });

      assert.isTrue(fs.existsSync('./test/fixture/test3.js'));

      const readData = fs.readFileSync('./test/fixture/test3.js').toString();

      assert.strictEqual(readData, writeData);
   });

   it('create archive (1)', async () =>
   {
      fileArchive.archiveCreate({ filePath: 'archive' });

      fileArchive.writeFile({ fileData: writeData, filePath: 'test3.js' });
      fileArchive.writeFile({ fileData: writeData, filePath: 'test4.js' });
      fileArchive.copy({ srcPath: './test/fixture/test.js', destPath: 'test.js' });

      await fileArchive.archiveFinalize();

      assert.isTrue(fs.existsSync('./test/fixture/archive.tar.gz'));
   });

   it('create archive (2)', async () =>
   {
      fileArchive.archiveCreate({ filePath: 'archive2' });

      fileArchive.writeFile({ fileData: writeData, filePath: 'test3.js' });
      fileArchive.writeFile({ fileData: writeData, filePath: 'test4.js' });
      fileArchive.copy({ srcPath: './test/fixture/test.js', destPath: 'test.js' });

      fileArchive.archiveCreate({ filePath: 'archive' });

      fileArchive.writeFile({ fileData: writeData, filePath: 'test3.js' });
      fileArchive.writeFile({ fileData: writeData, filePath: 'test4.js' });
      fileArchive.copy({ srcPath: './test/fixture/test.js', destPath: 'test.js' });

      await fileArchive.archiveFinalize();

      await fileArchive.archiveFinalize();

      assert.isTrue(fs.existsSync('./test/fixture/archive2.tar.gz'));
   });

   // This test will remove all files from `./test/fixture`.
   it('emptyRelativePath', () =>
   {
      let files = fs.readdirSync('./test/fixture');

      assert.lengthOf(files, 5);

      fileArchive.emptyRelativePath();

      files = fs.readdirSync('./test/fixture');

      assert.lengthOf(files, 0);
   });
});

const writeData =
`/**
 * A comment.
 */
export default class Test
{
   constructor()
   {
      this.test = true;
   }
}
`;
