import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePasswordDto } from './updatePassword.dto';

describe('UpdatePasswordDto', () => {
  it('accepts valid current and new passwords', async () => {
    const dto = plainToInstance(UpdatePasswordDto, {
      currentPassword: 'current-password',
      newPassword: 'new-password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    { currentPassword: 'short', newPassword: 'new-password' },
    { currentPassword: 'current-password', newPassword: 'short' },
    { currentPassword: 123456, newPassword: 'new-password' },
  ])('rejects invalid password input: %p', async (payload) => {
    const dto = plainToInstance(UpdatePasswordDto, payload);

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
