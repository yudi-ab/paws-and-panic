import { UsersApi } from '@accelbyte/sdk-iam';
const proto = Object.getPrototypeOf(new UsersApi({}));
const methods = Object.getOwnPropertyNames(proto);
console.log('Methods found:');
console.log(methods.filter(m => m.toLowerCase().includes('update') || m.toLowerCase().includes('user')));
