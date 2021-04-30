import { assert }    from 'chai';
import fs            from 'fs-extra';

import FileArchive   from '../../src/FileArchive.js';

const fileArchive = new FileArchive({ relativePath: './test/fixture' });

// Empty test fixture directory.
fs.emptydirSync('./test/fixture');

// Note: to prevent `./test/fixture` from being emptied at the end of testing comment out the last test
// `emptyRelativePath`.
//   writeFile({ data, filepath, silent = false, encoding = 'utf8' } = {})

describe('FileArchive:', () =>
{
   it('writeFile', () =>
   {
      fileArchive.writeFile({ data: writeData, filepath: 'test.js' });
      fileArchive.writeFile({ data: writeData, filepath: 'test2.js' });

      assert.isTrue(fs.existsSync('./test/fixture/test.js'));
      assert.isTrue(fs.existsSync('./test/fixture/test2.js'));

      const readData = fs.readFileSync('./test/fixture/test.js').toString();
      const readData2 = fs.readFileSync('./test/fixture/test2.js').toString();

      assert.strictEqual(readData, writeData);
      assert.strictEqual(readData2, writeData);
   });

   it('copy', () =>
   {
      fileArchive.copy({ src: './test/fixture/test.js', dest: 'test3.js' });

      assert.isTrue(fs.existsSync('./test/fixture/test3.js'));

      const readData = fs.readFileSync('./test/fixture/test3.js').toString();

      assert.strictEqual(readData, writeData);
   });

   it('create archive (1)', async () =>
   {
      fileArchive.archiveCreate({ filepath: 'archive' });

      fileArchive.writeFile({ data: writeData, filepath: 'test3.js' });
      fileArchive.writeFile({ data: writeData, filepath: 'test4.js' });
      fileArchive.copy({ src: './test/fixture/test.js', dest: 'test.js' });

      await fileArchive.archiveFinalize();

      assert.isTrue(fs.existsSync('./test/fixture/archive.tar.gz'));
   });

   it('create archive (2)', async () =>
   {
      fileArchive.archiveCreate({ filepath: 'archive2' });

      fileArchive.writeFile({ data: writeData, filepath: 'test3.js' });
      fileArchive.writeFile({ data: writeData, filepath: 'test4.js' });
      fileArchive.copy({ src: './test/fixture/test.js', dest: 'test.js' });

      fileArchive.archiveCreate({ filepath: 'archive' });

      fileArchive.writeFile({ data: writeData, filepath: 'test3.js' });
      fileArchive.writeFile({ data: writeData, filepath: 'test4.js' });
      fileArchive.copy({ src: './test/fixture/test.js', dest: 'test.js' });

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
