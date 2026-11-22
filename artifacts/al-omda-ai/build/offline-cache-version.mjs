import {createHash} from 'node:crypto';

export function versionOfflineWorker(source,assets) {
 if(!source.includes('__OMDA_ASSET_VERSION__'))throw new Error('Offline worker version marker is missing');
 const version=createHash('sha256').update(assets).digest('hex').slice(0,16);
 return source.replaceAll('__OMDA_ASSET_VERSION__',version);
}
